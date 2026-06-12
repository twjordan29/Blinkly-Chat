import express from 'express';
import pool from '../db/connection.js';
import { authMiddleware } from '../middleware/auth.js';
import { vapidKeys } from '../utils/pushManager.js';

const router = express.Router();

// GET /api/push/vapid-key - Retrieve public VAPID key
router.get('/vapid-key', (req, res) => {
  if (vapidKeys.publicKey) {
    res.json({ publicKey: vapidKeys.publicKey });
  } else {
    res.status(500).json({ error: 'VAPID keys not configured on server' });
  }
});

// POST /api/push/subscribe - Store a subscription
router.post('/subscribe', authMiddleware, async (req, res) => {
  const { endpoint, keys } = req.body;
  const userId = req.user.id;
  const userAgent = req.headers['user-agent'] || null;

  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription payload' });
  }

  try {
    // Check if subscription already exists for this user/endpoint to prevent duplicates
    const [existing] = await pool.query(
      'SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [userId, endpoint]
    );

    if (existing.length > 0) {
      // Update existing subscription
      await pool.query(
        'UPDATE push_subscriptions SET p256dh = ?, auth = ?, user_agent = ?, updated_at = NOW() WHERE id = ?',
        [keys.p256dh, keys.auth, userAgent, existing[0].id]
      );
      return res.status(200).json({ success: true, message: 'Subscription updated' });
    }

    // Insert new subscription
    await pool.query(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)',
      [userId, endpoint, keys.p256dh, keys.auth, userAgent]
    );

    res.status(201).json({ success: true, message: 'Subscription saved' });
  } catch (err) {
    console.error('Error in /subscribe endpoint:', err);
    res.status(500).json({ error: 'Server failed to save subscription' });
  }
});

// DELETE /api/push/unsubscribe - Remove a subscription
router.delete('/unsubscribe', authMiddleware, async (req, res) => {
  const { endpoint } = req.body;
  const userId = req.user.id;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required to unsubscribe' });
  }

  try {
    const [result] = await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [userId, endpoint]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Subscription removed' });
    } else {
      res.status(404).json({ error: 'Subscription not found' });
    }
  } catch (err) {
    console.error('Error in /unsubscribe endpoint:', err);
    res.status(500).json({ error: 'Server failed to unsubscribe' });
  }
});

export default router;
