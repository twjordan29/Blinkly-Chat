import jwt from 'jsonwebtoken';
import pool from '../db/connection.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'blinkly_premium_secret_key_2026_jwt');

    // Fetch user details
    const [users] = await pool.query(
      'SELECT id, username, email, display_name, avatar_url, bio, status_message, location, website_url, theme_preference, show_online_status, show_last_seen, allow_friend_requests, is_admin FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const adminMiddleware = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Forbidden: Admin access only' });
  }
  next();
};
