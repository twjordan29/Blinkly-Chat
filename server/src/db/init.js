import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function initDb() {
  console.log('Initializing database...');
  
  // Connect without DB to create it if it doesn't exist
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'blinkly'}\`;`);
  await connection.end();

  // Re-connect with the database
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'blinkly',
  });

  console.log('Database connected. Creating tables...');

  // Create Users Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(100) DEFAULT NULL,
      avatar_url VARCHAR(255) DEFAULT NULL,
      bio TEXT DEFAULT NULL,
      status_message VARCHAR(255) DEFAULT NULL,
      location VARCHAR(100) DEFAULT NULL,
      website_url VARCHAR(255) DEFAULT NULL,
      theme_preference VARCHAR(20) DEFAULT 'system',
      show_online_status BOOLEAN DEFAULT TRUE,
      show_last_seen BOOLEAN DEFAULT TRUE,
      allow_friend_requests BOOLEAN DEFAULT TRUE,
      is_admin BOOLEAN DEFAULT FALSE,
      is_online BOOLEAN DEFAULT FALSE,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // Ensure user columns exist (in case tables already exist)
  const userColumnsToAlter = [
    { name: 'bio', type: 'TEXT DEFAULT NULL' },
    { name: 'status_message', type: 'VARCHAR(255) DEFAULT NULL' },
    { name: 'location', type: 'VARCHAR(100) DEFAULT NULL' },
    { name: 'website_url', type: 'VARCHAR(255) DEFAULT NULL' },
    { name: 'theme_preference', type: 'VARCHAR(20) DEFAULT \'system\'' },
    { name: 'show_online_status', type: 'BOOLEAN DEFAULT TRUE' },
    { name: 'show_last_seen', type: 'BOOLEAN DEFAULT TRUE' },
    { name: 'allow_friend_requests', type: 'BOOLEAN DEFAULT TRUE' },
    { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
  ];

  for (const col of userColumnsToAlter) {
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
    } catch (err) {
      console.log(`Adding ${col.name} column info: `, err.message);
    }
  }

  // Create Friend Requests Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender_id INT NOT NULL,
      receiver_id INT NOT NULL,
      status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_request (sender_id, receiver_id),
      FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  // Create Friendships Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id_1 INT NOT NULL,
      user_id_2 INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_friendship (user_id_1, user_id_2),
      FOREIGN KEY (user_id_1) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id_2) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  // Create Conversations Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // Create Conversation Participants Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_participants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_participant (conversation_id, user_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  // Create Messages Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_id INT NOT NULL,
      message_text TEXT NULL,
      message_type VARCHAR(20) DEFAULT 'text',
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  // Ensure message_text is nullable and message_type column exists (in case tables already exist)
  try {
    await pool.query('ALTER TABLE messages MODIFY COLUMN message_text TEXT NULL');
  } catch (err) {
    console.log('Altering message_text column info: ', err.message);
  }
  try {
    await pool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text'");
  } catch (err) {
    console.log('Adding message_type column info: ', err.message);
  }

  // Create Message Attachments Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      file_url VARCHAR(255) NOT NULL,
      file_path VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      size_bytes INT NOT NULL,
      width INT DEFAULT NULL,
      height INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  // Create Message Reactions Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      emoji VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_message_reaction (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  // Create Push Subscriptions Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  console.log('Tables verified/created. Seeding default data...');

  // Check if admin user exists
  const [rows] = await pool.query('SELECT * FROM users WHERE username = "admin"');
  if (rows.length === 0) {
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO users (username, email, password_hash, display_name, is_admin)
      VALUES ("admin", "admin@blinkly.chat", ?, "Blinkly Admin", TRUE)
    `, [adminPasswordHash]);
    console.log('Default admin user seeded: username "admin", password "admin123"');
  }

  await pool.end();
  console.log('Database initialization complete!');
}

initDb().catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
