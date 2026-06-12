import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import pool from './db/connection.js';

// Import Routes
import authRoutes from './routes/auth.js';
import friendRoutes from './routes/friends.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';
import meRoutes from './routes/me.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Test database connection on startup
pool.getConnection()
  .then(conn => {
    console.log('Successfully connected to MariaDB database!');
    conn.release();
  })
  .catch(err => {
    console.error('======================================================================');
    console.error('WARNING: Could not connect to MariaDB database.');
    console.error('Please ensure MariaDB is running and check credentials in server/.env');
    console.error('Error Details:', err.message);
    console.error('======================================================================');
  });

// Configure Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Map of userId -> Set of socketIds (to handle multiple tabs)
const onlineUsers = new Map();

// Inject Socket.IO and online users map into request object
app.use((req, res, next) => {
  req.io = io;
  req.onlineUsers = onlineUsers;
  next();
});

// Enable CORS
app.use(cors({
  origin: '*', // In production, replace with specific domains
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

// Serve uploads folder static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/me', meRoutes);

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Helper to broadcast status changes to friends
async function broadcastStatusToFriends(userId, isOnline) {
  try {
    // Find all friends
    const [friends] = await pool.query(`
      SELECT u.id
      FROM friendships f
      JOIN users u ON (f.user_id_1 = ? AND f.user_id_2 = u.id) OR (f.user_id_2 = ? AND f.user_id_1 = u.id)
    `, [userId, userId]);

    // Fetch privacy settings
    const [privacy] = await pool.query('SELECT show_online_status, show_last_seen, last_seen FROM users WHERE id = ?', [userId]);
    const hasPrivacy = privacy && privacy.length > 0;
    const showOnline = hasPrivacy ? privacy[0].show_online_status !== 0 : true;
    const showLastSeen = hasPrivacy ? privacy[0].show_last_seen !== 0 : true;

    const broadcastOnline = showOnline ? isOnline : false;
    const broadcastLastSeen = showLastSeen ? ((hasPrivacy && privacy[0].last_seen) || new Date()) : null;

    friends.forEach(friend => {
      const friendSockets = onlineUsers.get(friend.id);
      if (friendSockets) {
        friendSockets.forEach(socketId => {
          io.to(socketId).emit('friend_status', {
            userId,
            isOnline: broadcastOnline,
            lastSeen: broadcastLastSeen
          });
        });
      }
    });
  } catch (error) {
    console.error('Error broadcasting status to friends:', error);
  }
}

// Socket JWT authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'blinkly_premium_secret_key_2026_jwt');
    socket.userId = decoded.id;
    next();
  } catch (err) {
    return next(new Error('Authentication error: Token invalid'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.userId;
  console.log(`User connected: ${userId} (Socket: ${socket.id})`);

  // Handle online tracking
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
    
    // First connection, set user online in database
    try {
      await pool.query('UPDATE users SET is_online = TRUE WHERE id = ?', [userId]);
      // Broadcast online status to friends
      broadcastStatusToFriends(userId, true);
    } catch (err) {
      console.error('DB error setting user online:', err);
    }
  }
  onlineUsers.get(userId).add(socket.id);

  // Send initial list of online friend IDs to the newly connected user
  try {
    const [friends] = await pool.query(`
      SELECT u.id, u.show_online_status
      FROM friendships f
      JOIN users u ON (f.user_id_1 = ? AND f.user_id_2 = u.id) OR (f.user_id_2 = ? AND f.user_id_1 = u.id)
    `, [userId, userId]);

    const onlineFriendIds = friends
      .filter(f => onlineUsers.has(f.id) && f.show_online_status !== 0 && f.show_online_status !== false)
      .map(f => f.id);

    socket.emit('online_friends', onlineFriendIds);
  } catch (error) {
    console.error('Error sending online friends list:', error);
  }

  // Handle Real-Time Messages
  socket.on('send_message', async (data, callback) => {
    const { conversation_id, receiver_id, message_text, client_msg_id } = data;
    if (!conversation_id || !receiver_id || !message_text?.trim()) {
      return callback?.({ error: 'Invalid message parameters' });
    }

    try {
      // 1. Verify user is in conversation
      const [participants] = await pool.query(
        'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
        [conversation_id, userId]
      );

      if (participants.length === 0) {
        return callback?.({ error: 'Unauthorized conversation access' });
      }

      // 2. Insert message in database
      const [insertResult] = await pool.query(
        'INSERT INTO messages (conversation_id, sender_id, message_text, is_read) VALUES (?, ?, ?, FALSE)',
        [conversation_id, userId, message_text.trim()]
      );

      const messageId = insertResult.insertId;
      const createdAt = new Date();

      const messageObj = {
        id: messageId,
        conversation_id,
        sender_id: userId,
        message_text: message_text.trim(),
        is_read: false,
        created_at: createdAt,
        client_msg_id: client_msg_id || null
      };

      // 3. Update conversation last updated timestamp
      await pool.query(
        'UPDATE conversations SET updated_at = ? WHERE id = ?',
        [createdAt, conversation_id]
      );

      // 4. Emit to all sockets of the receiver
      const receiverSockets = onlineUsers.get(parseInt(receiver_id));
      if (receiverSockets) {
        receiverSockets.forEach(sId => {
          io.to(sId).emit('receive_message', messageObj);
          io.to(sId).emit('message_received', messageObj);
        });
      }

      // 5. Emit to all sockets of the sender (including sending socket for confirmation)
      const senderSockets = onlineUsers.get(userId);
      if (senderSockets) {
        senderSockets.forEach(sId => {
          io.to(sId).emit('receive_message', messageObj);
          io.to(sId).emit('message_received', messageObj);
        });
      }

      // Acknowledge delivery
      if (callback) callback({ success: true, message: messageObj });
    } catch (error) {
      console.error('Send message error:', error);
      return callback?.({ error: 'Server failed to deliver message' });
    }
  });

  // Handle Typing Start (Phase 2)
  socket.on('typing_start', async (data) => {
    const { conversation_id, receiver_id } = data;
    if (!conversation_id || !receiver_id) return;

    try {
      // Verify user belongs to conversation
      const [participants] = await pool.query(
        'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
        [conversation_id, userId]
      );

      if (participants.length === 0) return;

      // Get sender display name
      const [userRows] = await pool.query(
        'SELECT display_name, username FROM users WHERE id = ?',
        [userId]
      );
      const displayName = userRows.length > 0 ? (userRows[0].display_name || userRows[0].username) : 'Someone';

      // Broadcast to receiver sockets
      const receiverSockets = onlineUsers.get(parseInt(receiver_id));
      if (receiverSockets) {
        receiverSockets.forEach(sId => {
          io.to(sId).emit('typing_start', {
            conversationId: conversation_id,
            userId,
            displayName
          });
        });
      }
    } catch (err) {
      console.error('typing_start socket error:', err);
    }
  });

  // Handle Typing Stop (Phase 2)
  socket.on('typing_stop', async (data) => {
    const { conversation_id, receiver_id } = data;
    if (!conversation_id || !receiver_id) return;

    try {
      // Broadcast to receiver sockets
      const receiverSockets = onlineUsers.get(parseInt(receiver_id));
      if (receiverSockets) {
        receiverSockets.forEach(sId => {
          io.to(sId).emit('typing_stop', {
            conversationId: conversation_id,
            userId
          });
        });
      }
    } catch (err) {
      console.error('typing_stop socket error:', err);
    }
  });

  // Handle Read Receipts in Real-Time
  socket.on('read_receipt', async (data) => {
    const { conversation_id, sender_id } = data;
    const senderSockets = onlineUsers.get(parseInt(sender_id));

    try {
      // Mark read in DB
      await pool.query(`
        UPDATE messages 
        SET is_read = TRUE 
        WHERE conversation_id = ? AND sender_id = ? AND is_read = FALSE
      `, [conversation_id, sender_id]);

      // Emit read receipt back to the original sender's active sockets
      if (senderSockets) {
        senderSockets.forEach(sId => {
          io.to(sId).emit('read_receipt_update', {
            conversation_id,
            reader_id: userId
          });
        });
      }
    } catch (error) {
      console.error('Read receipt socket error:', error);
    }
  });

  // Handle Disconnection
  socket.on('disconnect', async () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const userSockets = onlineUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      
      if (userSockets.size === 0) {
        // Last tab closed, set user offline in database and record last seen
        onlineUsers.delete(userId);
        try {
          const timestamp = new Date();
          await pool.query(
            'UPDATE users SET is_online = FALSE, last_seen = ? WHERE id = ?',
            [timestamp, userId]
          );
          // Broadcast offline status to friends
          broadcastStatusToFriends(userId, false);
        } catch (err) {
          console.error('DB error setting user offline:', err);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Blinkly premium chat server running on port ${PORT}`);
});
