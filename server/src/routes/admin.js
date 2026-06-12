import express from 'express';
import pool from '../db/connection.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Admin Dashboard stats
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [[{ total_users }]] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
    const [[{ total_messages }]] = await pool.query('SELECT COUNT(*) AS total_messages FROM messages');
    const [[{ online_users }]] = await pool.query('SELECT COUNT(*) AS online_users FROM users WHERE is_online = TRUE');

    return res.json({
      total_users,
      total_messages,
      online_users
    });
  } catch (error) {
    console.error('Fetch admin stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
});

export default router;
