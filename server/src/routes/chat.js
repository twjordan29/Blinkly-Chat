import express from 'express';
import pool from '../db/connection.js';
import { authMiddleware } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sizeOf from 'image-size';

const router = express.Router();

// Ensure base uploads directory exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage config for direct message images
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { conversation_id } = req.params;
    const dir = path.join('uploads', 'messages', String(conversation_id));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'msg-' + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

// Multer File filter for images
const uploadFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedExtensions = /jpeg|jpg|png|gif|webp/;

  const extName = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  const mimeType = allowedMimeTypes.includes(file.mimetype);

  if (extName && mimeType) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed!'));
  }
};

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: uploadFilter
});

// Get list of conversations (chats)
router.get('/conversations', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const [conversations] = await pool.query(`
      SELECT c.id AS conversation_id, c.updated_at,
             u.id AS other_user_id, u.username, u.display_name, u.avatar_url,
             IF(u.show_online_status = TRUE, u.is_online, FALSE) AS is_online,
             IF(u.show_last_seen = TRUE, u.last_seen, NULL) AS last_seen,
             IF(m.message_type = 'image', COALESCE(NULLIF(m.message_text, ''), 'Photo'), m.message_text) AS last_message, 
             m.sender_id AS last_message_sender_id, m.created_at AS last_message_time,
             (SELECT COUNT(*) FROM messages 
              WHERE conversation_id = c.id AND sender_id = u.id AND is_read = FALSE) AS unread_count
      FROM conversation_participants cp1
      JOIN conversations c ON cp1.conversation_id = c.id
      JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id AND cp2.user_id != cp1.user_id
      JOIN users u ON cp2.user_id = u.id
      LEFT JOIN messages m ON m.id = (
          SELECT id FROM messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC, id DESC
          LIMIT 1
      )
      WHERE cp1.user_id = ?
      ORDER BY COALESCE(m.created_at, c.updated_at) DESC
    `, [userId]);

    return res.json({ conversations });
  } catch (error) {
    console.error('Fetch conversations error:', error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Load messages for a conversation
router.get('/conversations/:conversation_id/messages', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const conversationId = req.params.conversation_id;

  try {
    // Verify user is a participant
    const [participants] = await pool.query(
      'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    if (participants.length === 0) {
      return res.status(403).json({ error: 'You are not a participant in this conversation' });
    }

    // Load last 100 messages (ordered oldest to newest for the chat window) with attachments
    const [messages] = await pool.query(`
      SELECT m.id, m.sender_id, m.message_text, m.message_type, m.is_read, m.created_at,
             a.id AS attachment_id, a.file_url, a.mime_type, a.original_name, a.size_bytes, a.width, a.height
      FROM (
        SELECT id, sender_id, message_text, message_type, is_read, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 100
      ) m
      LEFT JOIN message_attachments a ON m.id = a.message_id
      ORDER BY m.created_at ASC, m.id ASC
    `, [conversationId]);

    const formattedMessages = messages.map(mRow => ({
      id: mRow.id,
      sender_id: mRow.sender_id,
      message_text: mRow.message_text,
      message_type: mRow.message_type || 'text',
      is_read: mRow.is_read,
      created_at: mRow.created_at,
      attachment: mRow.attachment_id ? {
        id: mRow.attachment_id,
        file_url: mRow.file_url,
        mime_type: mRow.mime_type,
        original_name: mRow.original_name,
        size_bytes: mRow.size_bytes,
        width: mRow.width,
        height: mRow.height
      } : null
    }));

    // Fetch reactions for these loaded messages (Phase 2)
    const messageIds = formattedMessages.map(m => m.id);
    let reactionsMap = {};
    
    if (messageIds.length > 0) {
      const [reactions] = await pool.query(`
        SELECT message_id, user_id, emoji 
        FROM message_reactions 
        WHERE message_id IN (?)
      `, [messageIds]);

      reactions.forEach(r => {
        if (!reactionsMap[r.message_id]) {
          reactionsMap[r.message_id] = [];
        }
        reactionsMap[r.message_id].push({
          userId: r.user_id,
          emoji: r.emoji
        });
      });
    }

    const messagesWithReactions = formattedMessages.map(m => ({
      ...m,
      reactions: reactionsMap[m.id] || []
    }));

    return res.json({ messages: messagesWithReactions });
  } catch (error) {
    console.error('Fetch messages error:', error);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Upload image inside conversation
const uploadSingle = uploadAttachment.single('image');

router.post('/conversations/:conversation_id/messages/image', authMiddleware, (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const userId = req.user.id;
  const conversationId = req.params.conversation_id;
  const caption = req.body.caption || '';

  if (!req.file) {
    return res.status(400).json({ error: 'Image file is required' });
  }

  const file = req.file;

  try {
    // 1. Verify user is in conversation
    const [participants] = await pool.query(
      'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    if (participants.length === 0) {
      // Clean up uploaded file if unauthorized
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(403).json({ error: 'You are not a participant in this conversation' });
    }

    // 2. Normalize file URL with forward slashes
    const fileUrl = '/' + file.path.replace(/\\/g, '/');

    // 3. Extract dimensions using image-size
    let width = null;
    let height = null;
    try {
      const dimensions = sizeOf(file.path);
      width = dimensions.width;
      height = dimensions.height;
    } catch (dimErr) {
      console.error('Dimensions extraction failed:', dimErr.message);
    }

    // 4. Save to Database using a transaction
    const connection = await pool.getConnection();
    let messageId;
    let createdAt = new Date();
    try {
      await connection.beginTransaction();

      // Create message record
      const [msgResult] = await connection.query(
        `INSERT INTO messages (conversation_id, sender_id, message_text, message_type, is_read) 
         VALUES (?, ?, ?, 'image', FALSE)`,
        [conversationId, userId, caption.trim() || null]
      );
      messageId = msgResult.insertId;

      // Create attachment record
      await connection.query(
        `INSERT INTO message_attachments 
         (message_id, conversation_id, user_id, file_url, file_path, mime_type, original_name, size_bytes, width, height) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [messageId, conversationId, userId, fileUrl, file.path, file.mimetype, file.originalname, file.size, width, height]
      );

      // Update conversation updated_at
      await connection.query(
        'UPDATE conversations SET updated_at = ? WHERE id = ?',
        [createdAt, conversationId]
      );

      await connection.commit();
    } catch (dbErr) {
      await connection.rollback();
      throw dbErr;
    } finally {
      connection.release();
    }

    // 5. Fetch fully-formed message object
    const [savedMessages] = await pool.query(`
      SELECT m.id, m.conversation_id, m.sender_id, m.message_text, m.message_type, m.is_read, m.created_at,
             a.id AS attachment_id, a.file_url, a.mime_type, a.original_name, a.size_bytes, a.width, a.height
      FROM messages m
      LEFT JOIN message_attachments a ON m.id = a.message_id
      WHERE m.id = ?
    `, [messageId]);

    if (savedMessages.length === 0) {
      return res.status(500).json({ error: 'Failed to retrieve saved image message' });
    }

    const msgRow = savedMessages[0];
    const messageObj = {
      id: msgRow.id,
      conversation_id: msgRow.conversation_id,
      sender_id: msgRow.sender_id,
      message_text: msgRow.message_text,
      message_type: msgRow.message_type,
      is_read: msgRow.is_read,
      created_at: msgRow.created_at,
      attachment: msgRow.attachment_id ? {
        id: msgRow.attachment_id,
        file_url: msgRow.file_url,
        mime_type: msgRow.mime_type,
        original_name: msgRow.original_name,
        size_bytes: msgRow.size_bytes,
        width: msgRow.width,
        height: msgRow.height
      } : null
    };

    // 6. Broadcast via Socket.IO to all online participant tabs
    const [participantsList] = await pool.query(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = ?',
      [conversationId]
    );

    participantsList.forEach(p => {
      const sockets = req.onlineUsers?.get(p.user_id);
      if (sockets) {
        sockets.forEach(sId => {
          req.io.to(sId).emit('receive_message', messageObj);
          req.io.to(sId).emit('message_received', messageObj);
        });
      }
    });

    return res.json({ success: true, message: messageObj });
  } catch (error) {
    console.error('Image message route error:', error);
    // Clean up file if anything failed
    if (file && file.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
    return res.status(500).json({ error: 'Failed to send image message' });
  }
});

// Mark messages as read
router.post('/conversations/:conversation_id/read', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const conversationId = req.params.conversation_id;

  try {
    // Verify user is a participant
    const [participants] = await pool.query(
      'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    if (participants.length === 0) {
      return res.status(403).json({ error: 'You are not a participant in this conversation' });
    }

    // Mark messages sent by the other user as read
    await pool.query(`
      UPDATE messages 
      SET is_read = TRUE 
      WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE
    `, [conversationId, userId]);

    return res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    return res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// Get or create conversation with a specific friend (helpful helper endpoint!)
router.post('/conversations/get-or-create', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { friend_id } = req.body;

  if (!friend_id) {
    return res.status(400).json({ error: 'Friend ID is required' });
  }

  try {
    // Check if they are friends
    const u1 = Math.min(userId, friend_id);
    const u2 = Math.max(userId, friend_id);
    const [friendship] = await pool.query(
      'SELECT id FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?',
      [u1, u2]
    );

    if (friendship.length === 0) {
      return res.status(400).json({ error: 'You must be friends with the user to start a conversation' });
    }

    // Check if conversation exists
    const [existingConversations] = await pool.query(`
      SELECT cp1.conversation_id 
      FROM conversation_participants cp1
      JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
      WHERE cp1.user_id = ? AND cp2.user_id = ?
    `, [userId, friend_id]);

    if (existingConversations.length > 0) {
      return res.json({ conversation_id: existingConversations[0].conversation_id });
    }

    // Create new conversation
    const [convResult] = await pool.query('INSERT INTO conversations () VALUES ()');
    const conversationId = convResult.insertId;

    // Add participants
    await pool.query(`
      INSERT INTO conversation_participants (conversation_id, user_id) 
      VALUES (?, ?), (?, ?)
    `, [conversationId, userId, conversationId, friend_id]);

    return res.status(201).json({ conversation_id: conversationId });
  } catch (error) {
    console.error('Get/Create conversation error:', error);
    return res.status(500).json({ error: 'Failed to process conversation initiation' });
  }
});

// Add or toggle a message reaction (Phase 2)
router.post('/messages/:message_id/react', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const messageId = req.params.message_id;
  const { emoji } = req.body;

  // 1. Validate emoji
  const allowedEmojis = ['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '💯'];
  if (!emoji || !allowedEmojis.includes(emoji)) {
    return res.status(400).json({ error: 'Invalid or unsupported reaction emoji' });
  }

  try {
    // 2. Fetch the message to get its conversation ID
    const [messages] = await pool.query(
      'SELECT conversation_id, sender_id FROM messages WHERE id = ?',
      [messageId]
    );

    if (messages.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const conversationId = messages[0].conversation_id;

    // 3. Verify user belongs to the conversation
    const [participants] = await pool.query(
      'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    if (participants.length === 0) {
      return res.status(403).json({ error: 'You are not a participant in this conversation' });
    }

    // 4. Check if the user already has a reaction on this message
    const [existing] = await pool.query(
      'SELECT id, emoji FROM message_reactions WHERE message_id = ? AND user_id = ?',
      [messageId, userId]
    );

    let action = '';
    let finalEmoji = emoji;

    if (existing.length > 0) {
      const currentEmoji = existing[0].emoji;
      if (currentEmoji === emoji) {
        // Toggle off if same reaction clicked again
        await pool.query(
          'DELETE FROM message_reactions WHERE id = ?',
          [existing[0].id]
        );
        action = 'remove';
        finalEmoji = null;
      } else {
        // Update to new emoji if different reaction clicked
        await pool.query(
          'UPDATE message_reactions SET emoji = ? WHERE id = ?',
          [emoji, existing[0].id]
        );
        action = 'update';
      }
    } else {
      // Create new reaction
      await pool.query(
        'INSERT INTO message_reactions (message_id, conversation_id, user_id, emoji) VALUES (?, ?, ?, ?)',
        [messageId, conversationId, userId, emoji]
      );
      action = 'add';
    }

    // 5. Query all reactions for this message to broadcast the updated state
    const [allReactions] = await pool.query(
      'SELECT user_id, emoji FROM message_reactions WHERE message_id = ?',
      [messageId]
    );

    const reactionPayload = {
      messageId: parseInt(messageId),
      conversationId,
      reactions: allReactions.map(r => ({
        userId: r.user_id,
        emoji: r.emoji
      }))
    };

    // 6. Broadcast updated reactions to all conversation participant active sockets
    const [participantsList] = await pool.query(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = ?',
      [conversationId]
    );

    participantsList.forEach(p => {
      const sockets = req.onlineUsers?.get(p.user_id);
      if (sockets) {
        sockets.forEach(sId => {
          req.io.to(sId).emit('message_reaction_updated', reactionPayload);
        });
      }
    });

    return res.json({ success: true, ...reactionPayload });
  } catch (error) {
    console.error('Reaction route error:', error);
    return res.status(500).json({ error: 'Failed to process reaction' });
  }
});

export default router;
