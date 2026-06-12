import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../db/connection.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Config for Avatar Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif|webp/;
    const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = fileTypes.test(file.mimetype);
    if (extName && mimeType) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed!'));
    }
  }
});

// Register
router.post('/register', async (req, res) => {
  const { username, email, password, display_name } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  try {
    // Check if user or email already exists
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash Password
    const passwordHash = await bcrypt.hash(password, 10);
    const displayNameVal = display_name || username;

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, displayNameVal]
    );

    const userId = result.insertId;

    // Generate Token
    const token = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET || 'blinkly_premium_secret_key_2026_jwt',
      { expiresIn: '30d' }
    );

    return res.status(201).json({
      token,
      user: {
        id: userId,
        username,
        email,
        display_name: displayNameVal,
        avatar_url: null,
        is_admin: false
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Database error occurred during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: 'Username/Email and password are required' });
  }

  try {
    // Find user
    const [users] = await pool.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [usernameOrEmail, usernameOrEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const user = users[0];

    // Check Password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    // Generate Token
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || 'blinkly_premium_secret_key_2026_jwt',
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Database error occurred during login' });
  }
});

// Get Current User Profile (auth protected)
router.get('/me', authMiddleware, async (req, res) => {
  return res.json({ user: req.user });
});

// Update profile text fields (display_name)
router.put('/profile', authMiddleware, async (req, res) => {
  const { display_name } = req.body;
  if (!display_name || display_name.trim() === '') {
    return res.status(400).json({ error: 'Display name cannot be empty' });
  }

  try {
    await pool.query(
      'UPDATE users SET display_name = ? WHERE id = ?',
      [display_name.trim(), req.user.id]
    );

    return res.json({
      message: 'Profile updated successfully',
      user: {
        ...req.user,
        display_name: display_name.trim()
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Avatar Upload Endpoint
router.post('/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload an image file' });
  }

  const avatarUrl = `/uploads/${req.file.filename}`;

  try {
    // Optional: Delete old avatar file from disk if it exists and is local
    const [currentUser] = await pool.query('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);
    if (currentUser.length > 0 && currentUser[0].avatar_url) {
      const oldPath = path.join(process.cwd(), currentUser[0].avatar_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);

    return res.json({
      message: 'Avatar uploaded successfully',
      avatar_url: avatarUrl
    });
  } catch (error) {
    console.error('Avatar upload database error:', error);
    return res.status(500).json({ error: 'Failed to save avatar image info' });
  }
}, (error, req, res, next) => {
  // Catch Multer/Upload Errors
  return res.status(400).json({ error: error.message });
});

export default router;
