import webpush from 'web-push';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import pool from '../db/connection.js';

dotenv.config();

let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

// Fallback: load/save keys to a local cache file if not present in env
const cachePath = path.join(process.cwd(), 'vapid-keys.json');

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (data.publicKey && data.privateKey) {
        vapidKeys = data;
        console.log('Loaded VAPID keys from local cache file.');
      }
    } catch (err) {
      console.error('Failed to read cached VAPID keys:', err);
    }
  }

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    try {
      vapidKeys = webpush.generateVAPIDKeys();
      fs.writeFileSync(cachePath, JSON.stringify(vapidKeys, null, 2), 'utf8');
      console.log('===================================================');
      console.log('Auto-generated persistent VAPID keys for Web Push!');
      console.log('Public Key:', vapidKeys.publicKey);
      console.log('Private Key:', vapidKeys.privateKey);
      console.log('These have been cached in server/vapid-keys.json');
      console.log('===================================================');
    } catch (err) {
      console.error('Failed to generate VAPID keys:', err);
    }
  }
}

// Set Web Push details if keys are available
if (vapidKeys.publicKey && vapidKeys.privateKey) {
  webpush.setVapidDetails(
    'mailto:support@blinkly.chat',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
}

/**
 * Send a push notification to a specific user
 * @param {number} userId - The target user ID
 * @param {object} payload - The notification payload
 */
export async function sendPushNotification(userId, payload) {
  try {
    // 1. Get all active subscriptions for this user
    const [subs] = await pool.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    if (subs.length === 0) return;

    const payloadString = JSON.stringify(payload);

    // 2. Send notification to all subscriptions
    const promises = subs.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, payloadString);
      } catch (err) {
        // If subscription is expired or invalid (404/410), delete it from database
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`Deleting expired push subscription ID: ${sub.id}`);
          await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        } else {
          console.error(`Error sending push notification to subscription ID ${sub.id}:`, err.message);
        }
      }
    });

    await Promise.all(promises);
  } catch (err) {
    console.error(`Error in sendPushNotification for user ${userId}:`, err);
  }
}

/**
 * Triggers a push notification for a new message
 * @param {number} senderId - Sender user ID
 * @param {number} receiverId - Receiver user ID
 * @param {object} messageObj - The message object
 */
export async function triggerMessageNotification(senderId, receiverId, messageObj) {
  if (Number(senderId) === Number(receiverId)) return;

  try {
    // 1. Fetch sender info
    const [senderRows] = await pool.query(
      'SELECT display_name, username FROM users WHERE id = ?',
      [senderId]
    );

    if (senderRows.length === 0) return;
    const senderName = senderRows[0].display_name || senderRows[0].username;

    // 2. Format body text
    let bodyText = messageObj.message_text || '';
    if (messageObj.message_type === 'image') {
      bodyText = 'Sent a photo';
      if (messageObj.message_text) {
        bodyText = `Sent a photo: ${messageObj.message_text}`;
      }
    }

    // 3. Construct payload
    const payload = {
      title: senderName,
      body: bodyText,
      conversationId: messageObj.conversation_id,
      tag: `msg-conv-${messageObj.conversation_id}`, // Groups notifications from same conversation
      data: {
        conversationId: messageObj.conversation_id,
        senderId
      }
    };

    // 4. Send to receiver
    await sendPushNotification(receiverId, payload);
  } catch (err) {
    console.error('Error triggering message push notification:', err);
  }
}

export { vapidKeys };
