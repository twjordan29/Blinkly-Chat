import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import pool from '../db/connection.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Extracted safely to prevent path traversal issues
    const safeExt = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${safeExt}`);
  }
});

// Multer Upload Rules
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExtensions = /jpeg|jpg|png|webp/;

    const extName = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedMimeTypes.includes(file.mimetype);

    if (extName && mimeType) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, jpeg, png, webp) are allowed!'));
    }
  }
});

// GET /api/me
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, username, email, display_name, avatar_url, bio, status_message, location, website_url, theme_preference, show_online_status, show_last_seen, allow_friend_requests, is_admin, created_at, updated_at
      FROM users 
      WHERE id = ?
    `, [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Get profile details error:', error);
    return res.status(500).json({ error: 'Failed to load user profile' });
  }
});

// Broadcast status update helper (Phase 2 Privacy)
async function broadcastStatusUpdate(req, userId) {
  try {
    const [friends] = await pool.query(`
      SELECT u.id
      FROM friendships f
      JOIN users u ON (f.user_id_1 = ? AND f.user_id_2 = u.id) OR (f.user_id_2 = ? AND f.user_id_1 = u.id)
    `, [userId, userId]);

    const [privacy] = await pool.query('SELECT is_online, show_online_status, show_last_seen, last_seen FROM users WHERE id = ?', [userId]);
    const hasPrivacy = privacy && privacy.length > 0;
    if (!hasPrivacy) return;
    const isOnline = privacy[0].is_online;
    const showOnline = privacy[0].show_online_status !== 0;
    const showLastSeen = privacy[0].show_last_seen !== 0;

    const broadcastOnline = showOnline ? isOnline : false;
    const broadcastLastSeen = showLastSeen ? (privacy[0].last_seen || new Date()) : null;

    friends.forEach(friend => {
      const friendSockets = req.onlineUsers?.get(friend.id);
      if (friendSockets) {
        friendSockets.forEach(socketId => {
          req.io?.to(socketId).emit('friend_status', {
            userId,
            isOnline: broadcastOnline,
            lastSeen: broadcastLastSeen
          });
        });
      }
    });
  } catch (error) {
    console.error('Error broadcasting status from profile patch:', error);
  }
}

// PATCH /api/me/profile
router.patch('/profile', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { 
    display_name, 
    username, 
    bio, 
    status_message, 
    location, 
    website_url,
    show_online_status,
    show_last_seen,
    allow_friend_requests
  } = req.body;

  // Validate display_name
  if (display_name !== undefined && (!display_name || display_name.trim() === '')) {
    return res.status(400).json({ error: 'Display name cannot be empty' });
  }

  // Validate username
  if (username !== undefined) {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
      return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
    }
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      return res.status(400).json({ error: 'Username can only contain alphanumeric characters, underscores, and hyphens' });
    }

    // Check uniqueness
    try {
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [trimmedUsername, userId]
      );
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    } catch (dbErr) {
      console.error(dbErr);
      return res.status(500).json({ error: 'Database verification failed' });
    }
  }

  // Validate website_url
  if (website_url !== undefined && website_url.trim() !== '') {
    const trimmedUrl = website_url.trim();
    // Simple robust regex validation for URL
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    if (!urlRegex.test(trimmedUrl)) {
      return res.status(400).json({ error: 'Invalid website URL format' });
    }
  }

  try {
    // Read current user info
    const [currentRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (currentRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const current = currentRows[0];

    const updatedDisplayName = display_name !== undefined ? display_name.trim() : current.display_name;
    const updatedUsername = username !== undefined ? username.trim() : current.username;
    const updatedBio = bio !== undefined ? (bio.trim() === '' ? null : bio.trim()) : current.bio;
    const updatedStatusMessage = status_message !== undefined ? (status_message.trim() === '' ? null : status_message.trim()) : current.status_message;
    const updatedLocation = location !== undefined ? (location.trim() === '' ? null : location.trim()) : current.location;
    const updatedWebsiteUrl = website_url !== undefined ? (website_url.trim() === '' ? null : website_url.trim()) : current.website_url;
    
    // Privacy fields
    const updatedShowOnline = show_online_status !== undefined ? Boolean(show_online_status) : current.show_online_status;
    const updatedShowLastSeen = show_last_seen !== undefined ? Boolean(show_last_seen) : current.show_last_seen;
    const updatedAllowFriendRequests = allow_friend_requests !== undefined ? Boolean(allow_friend_requests) : current.allow_friend_requests;

    await pool.query(`
      UPDATE users 
      SET display_name = ?, 
          username = ?, 
          bio = ?, 
          status_message = ?, 
          location = ?, 
          website_url = ?,
          show_online_status = ?,
          show_last_seen = ?,
          allow_friend_requests = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [
      updatedDisplayName, 
      updatedUsername, 
      updatedBio, 
      updatedStatusMessage, 
      updatedLocation, 
      updatedWebsiteUrl,
      updatedShowOnline,
      updatedShowLastSeen,
      updatedAllowFriendRequests,
      userId
    ]);

    // Fetch updated user object
    const [updatedRows] = await pool.query(`
      SELECT id, username, email, display_name, avatar_url, bio, status_message, location, website_url, theme_preference, show_online_status, show_last_seen, allow_friend_requests, is_admin, created_at, updated_at
      FROM users 
      WHERE id = ?
    `, [userId]);

    if (show_online_status !== undefined || show_last_seen !== undefined) {
      await broadcastStatusUpdate(req, userId);
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedRows[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile data' });
  }
});

// POST /api/me/avatar
router.post('/avatar', authMiddleware, (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File size limit exceeded or upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image file is required' });
  }

  const avatarUrl = `/uploads/${req.file.filename}`;

  try {
    // Delete old avatar from disk
    const [currentUser] = await pool.query('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);
    if (currentUser.length > 0 && currentUser[0].avatar_url) {
      const oldPath = path.join(process.cwd(), currentUser[0].avatar_url);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (fileErr) {
          console.error('Could not delete old avatar file:', fileErr);
        }
      }
    }

    // Update DB
    await pool.query('UPDATE users SET avatar_url = ?, updated_at = NOW() WHERE id = ?', [avatarUrl, req.user.id]);

    return res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatar_url: avatarUrl
    });
  } catch (error) {
    console.error('Avatar upload database error:', error);
    // Clean up uploaded file since database update failed
    if (req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(500).json({ error: 'Failed to save avatar details' });
  }
});

// DELETE /api/me/avatar
router.delete('/avatar', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const [users] = await pool.query('SELECT avatar_url FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const avatarUrl = users[0].avatar_url;
    if (avatarUrl) {
      // Delete from disk
      const filePath = path.join(process.cwd(), avatarUrl);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (fileErr) {
          console.error('Failed to delete avatar from disk:', fileErr);
        }
      }
    }

    await pool.query('UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = ?', [userId]);

    return res.json({
      success: true,
      message: 'Avatar reset successfully',
      avatar_url: null
    });
  } catch (error) {
    console.error('Avatar deletion error:', error);
    return res.status(500).json({ error: 'Failed to reset avatar' });
  }
});

// PATCH /api/me/appearance
router.patch('/appearance', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { theme_preference } = req.body;

  const allowedThemes = ['system', 'light', 'dark'];
  if (!theme_preference || !allowedThemes.includes(theme_preference)) {
    return res.status(400).json({ error: 'Invalid theme preference. Must be system, light, or dark.' });
  }

  try {
    await pool.query('UPDATE users SET theme_preference = ?, updated_at = NOW() WHERE id = ?', [theme_preference, userId]);

    return res.json({
      success: true,
      message: 'Appearance preference saved',
      theme_preference
    });
  } catch (error) {
    console.error('Theme preference update error:', error);
    return res.status(500).json({ error: 'Failed to update appearance preference' });
  }
});

// POST /api/me/password
router.post('/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const match = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [newHash, req.user.id]);

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
