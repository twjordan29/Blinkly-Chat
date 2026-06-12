import express from 'express';
import pool from '../db/connection.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Helper to emit socket events to online users
const emitToUser = (req, userId, event, data) => {
  if (!req.onlineUsers || !req.io) return;
  const sockets = req.onlineUsers.get(parseInt(userId));
  if (sockets) {
    sockets.forEach(sId => {
      req.io.to(sId).emit(event, data);
    });
  }
};

// Get list of friends
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const [friends] = await pool.query(`
      SELECT u.id, u.username, u.display_name, u.avatar_url,
             IF(u.show_online_status = TRUE, u.is_online, FALSE) AS is_online,
             IF(u.show_last_seen = TRUE, u.last_seen, NULL) AS last_seen
      FROM friendships f
      JOIN users u ON (f.user_id_1 = ? AND f.user_id_2 = u.id) OR (f.user_id_2 = ? AND f.user_id_1 = u.id)
      ORDER BY is_online DESC, u.display_name ASC
    `, [userId, userId]);

    return res.json({ friends });
  } catch (error) {
    console.error('Failed to fetch friends:', error);
    return res.status(500).json({ error: 'Failed to fetch friends list' });
  }
});

// Search users by username
router.get('/search', authMiddleware, async (req, res) => {
  const query = req.query.q;
  const userId = req.user.id;

  if (!query || query.trim() === '') {
    return res.json({ users: [] });
  }

  try {
    // Find users by username matching query (excluding current user)
    // Also join friend requests and friendships to determine status
    const [users] = await pool.query(`
      SELECT u.id, u.username, u.display_name, u.avatar_url,
             IF(u.show_online_status = TRUE, u.is_online, FALSE) AS is_online,
        (SELECT status FROM friend_requests 
         WHERE (sender_id = ? AND receiver_id = u.id) 
            OR (sender_id = u.id AND receiver_id = ?) 
         LIMIT 1) AS request_status,
        (SELECT sender_id FROM friend_requests 
         WHERE (sender_id = ? AND receiver_id = u.id) 
            OR (sender_id = u.id AND receiver_id = ?) 
         LIMIT 1) AS request_sender_id,
        (SELECT COUNT(*) FROM friendships 
         WHERE (user_id_1 = ? AND user_id_2 = u.id) 
            OR (user_id_1 = u.id AND user_id_2 = ?)
        ) > 0 AS is_friend
      FROM users u
      WHERE u.username LIKE ? AND u.id != ?
      LIMIT 15
    `, [
      userId, userId, 
      userId, userId,
      userId, userId,
      `%${query.trim()}%`, userId
    ]);

    return res.json({ users });
  } catch (error) {
    console.error('User search error:', error);
    return res.status(500).json({ error: 'Failed to search users' });
  }
});

// Send a friend request
router.post('/request', authMiddleware, async (req, res) => {
  const senderId = req.user.id;
  const { receiver_id } = req.body;

  if (!receiver_id) {
    return res.status(400).json({ error: 'Receiver ID is required' });
  }

  if (senderId === parseInt(receiver_id)) {
    return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
  }

  try {
    // Check if receiver allows friend requests
    const [receiverDetails] = await pool.query(
      'SELECT allow_friend_requests FROM users WHERE id = ?',
      [receiver_id]
    );

    if (receiverDetails.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (receiverDetails[0].allow_friend_requests === 0 || receiverDetails[0].allow_friend_requests === false) {
      return res.status(400).json({ error: 'This user is not accepting friend requests at this time' });
    }

    // Check if they are already friends
    const u1 = Math.min(senderId, receiver_id);
    const u2 = Math.max(senderId, receiver_id);
    const [friendship] = await pool.query(
      'SELECT id FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?',
      [u1, u2]
    );

    if (friendship.length > 0) {
      return res.status(400).json({ error: 'You are already friends with this user' });
    }

    // Check if there's an existing request
    const [existingRequest] = await pool.query(
      'SELECT * FROM friend_requests WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
      [senderId, receiver_id, receiver_id, senderId]
    );

    const [senderDetails] = await pool.query(
      'SELECT username, display_name, avatar_url FROM users WHERE id = ?',
      [senderId]
    );

    if (existingRequest.length > 0) {
      const reqState = existingRequest[0];
      if (reqState.status === 'pending') {
        return res.status(400).json({ error: 'A friend request is already pending between you' });
      } else if (reqState.status === 'accepted') {
        return res.status(400).json({ error: 'You are already friends' });
      } else {
        // If rejected, allow re-sending by updating status
        await pool.query(
          'UPDATE friend_requests SET sender_id = ?, receiver_id = ?, status = "pending" WHERE id = ?',
          [senderId, receiver_id, reqState.id]
        );

        // Real-time notification to receiver
        if (senderDetails.length > 0) {
          emitToUser(req, receiver_id, 'friend_request_received', {
            request_id: reqState.id,
            sender_id: senderId,
            username: senderDetails[0].username,
            display_name: senderDetails[0].display_name,
            avatar_url: senderDetails[0].avatar_url,
            created_at: new Date()
          });
        }
        
        return res.json({ message: 'Friend request sent successfully' });
      }
    }

    // Insert new request
    const [result] = await pool.query(
      'INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, "pending")',
      [senderId, receiver_id]
    );
    const requestId = result.insertId;

    // Real-time notification to receiver
    if (senderDetails.length > 0) {
      emitToUser(req, receiver_id, 'friend_request_received', {
        request_id: requestId,
        sender_id: senderId,
        username: senderDetails[0].username,
        display_name: senderDetails[0].display_name,
        avatar_url: senderDetails[0].avatar_url,
        created_at: new Date()
      });
    }

    return res.status(201).json({ message: 'Friend request sent successfully' });
  } catch (error) {
    console.error('Send request error:', error);
    return res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// View pending friend requests (sent and received)
router.get('/requests', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    // Received requests (where user is receiver)
    const [received] = await pool.query(`
      SELECT r.id AS request_id, u.id AS sender_id, u.username, u.display_name, u.avatar_url, r.created_at
      FROM friend_requests r
      JOIN users u ON r.sender_id = u.id
      WHERE r.receiver_id = ? AND r.status = 'pending'
    `, [userId]);

    // Sent requests (where user is sender)
    const [sent] = await pool.query(`
      SELECT r.id AS request_id, u.id AS receiver_id, u.username, u.display_name, u.avatar_url, r.created_at
      FROM friend_requests r
      JOIN users u ON r.receiver_id = u.id
      WHERE r.sender_id = ? AND r.status = 'pending'
    `, [userId]);

    return res.json({ received, sent });
  } catch (error) {
    console.error('Fetch requests error:', error);
    return res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// Accept friend request
router.post('/request/accept', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { request_id } = req.body;

  if (!request_id) {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  try {
    // Verify request exists, status is pending, and receiver is the current user
    const [requests] = await pool.query(
      'SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = "pending"',
      [request_id, userId]
    );

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Pending friend request not found' });
    }

    const request = requests[0];
    const senderId = request.sender_id;

    // Update request status to accepted
    await pool.query(
      'UPDATE friend_requests SET status = "accepted" WHERE id = ?',
      [request_id]
    );

    // Insert friendship
    const u1 = Math.min(userId, senderId);
    const u2 = Math.max(userId, senderId);
    
    // Ignore duplicate entries with INSERT IGNORE
    await pool.query(
      'INSERT IGNORE INTO friendships (user_id_1, user_id_2) VALUES (?, ?)',
      [u1, u2]
    );

    // Automatically create a conversation for these two users
    // First check if conversation already exists
    const [existingConversations] = await pool.query(`
      SELECT cp1.conversation_id 
      FROM conversation_participants cp1
      JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
      WHERE cp1.user_id = ? AND cp2.user_id = ?
    `, [userId, senderId]);

    let conversationId;
    if (existingConversations.length > 0) {
      conversationId = existingConversations[0].conversation_id;
    } else {
      // Create new conversation
      const [convResult] = await pool.query('INSERT INTO conversations () VALUES ()');
      conversationId = convResult.insertId;

      // Add participants
      await pool.query(`
        INSERT INTO conversation_participants (conversation_id, user_id) 
        VALUES (?, ?), (?, ?)
      `, [conversationId, userId, conversationId, senderId]);
    }

    // Emit real-time events to both users
    const acceptPayload = {
      request_id,
      conversation_id: conversationId,
      accepted_by: userId,
      sent_by: senderId
    };

    emitToUser(req, senderId, 'friend_request_accepted', acceptPayload);
    emitToUser(req, userId, 'friend_request_accepted', acceptPayload);

    emitToUser(req, senderId, 'friend_list_updated', { type: 'accept', friend_id: userId });
    emitToUser(req, userId, 'friend_list_updated', { type: 'accept', friend_id: senderId });

    return res.json({ 
      message: 'Friend request accepted and chat established', 
      conversation_id: conversationId 
    });
  } catch (error) {
    console.error('Accept request error:', error);
    return res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Reject or Cancel friend request
router.post('/request/reject', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { request_id } = req.body;

  if (!request_id) {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  try {
    // Find request details before deleting for socket notification targeting
    const [requests] = await pool.query(
      'SELECT sender_id, receiver_id FROM friend_requests WHERE id = ? AND (receiver_id = ? OR sender_id = ?)',
      [request_id, userId, userId]
    );

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Friend request not found or not authorized' });
    }

    const { sender_id, receiver_id } = requests[0];

    // Delete the request
    await pool.query('DELETE FROM friend_requests WHERE id = ?', [request_id]);

    // Real-time update for both sent/received ends
    emitToUser(req, sender_id, 'friend_list_updated', { type: 'reject', request_id });
    emitToUser(req, receiver_id, 'friend_list_updated', { type: 'reject', request_id });

    return res.json({ message: 'Friend request rejected/cancelled successfully' });
  } catch (error) {
    console.error('Reject request error:', error);
    return res.status(500).json({ error: 'Failed to process request action' });
  }
});

// Remove friend (unfriend)
router.delete('/:friend_id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const friendId = req.params.friend_id;

  try {
    const u1 = Math.min(userId, friendId);
    const u2 = Math.max(userId, friendId);

    // Delete friendship
    const [result] = await pool.query(
      'DELETE FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?',
      [u1, u2]
    );

    // Also delete any friend requests between them so they can send requests again
    await pool.query(
      'DELETE FROM friend_requests WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
      [userId, friendId, friendId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    // Real-time update to both users so screens update instantly
    emitToUser(req, userId, 'friend_list_updated', { type: 'remove', friend_id: friendId });
    emitToUser(req, friendId, 'friend_list_updated', { type: 'remove', friend_id: userId });

    return res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Remove friend error:', error);
    return res.status(500).json({ error: 'Failed to remove friend' });
  }
});

export default router;
