/**
 * Telegram Contact/Feedback Bot for Cloudflare Workers
 * Handles user messages and forwards them to admin with user identification
 */

export default {
  async fetch(request, env) {
    const { BOT_TOKEN, ADMIN_ID } = env;

    if (!BOT_TOKEN || !ADMIN_ID) {
      return new Response('Missing BOT_TOKEN or ADMIN_ID', { status: 500 });
    }

    // Handle webhook setup (GET request)
    if (request.method === 'GET') {
      return new Response('Telegram Bot is running!', { status: 200 });
    }

    // Handle Telegram updates (POST request)
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        await handleUpdate(update, BOT_TOKEN, ADMIN_ID);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error:', error);
        return new Response('Error processing update', { status: 500 });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
};

/**
 * Handle incoming Telegram updates
 */
async function handleUpdate(update, botToken, adminId) {
  const message = update.message;
  
  if (!message) return;

  const chatId = message.chat.id;
  const userId = message.from.id;
  const username = message.from.username || 'No username';
  const firstName = message.from.first_name || '';
  const lastName = message.from.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  // Handle /start command
  if (message.text === '/start') {
    await sendMessage(botToken, chatId, '👋 Welcome! Send me any message, and I\'ll forward it to the admin.');
    return;
  }

  // Check if this is the admin replying
  if (userId.toString() === adminId.toString() && message.reply_to_message) {
    await handleAdminReply(message, botToken, adminId);
    return;
  }

  // If user is admin sending a regular message, ignore
  if (userId.toString() === adminId.toString()) {
    return;
  }

  // Forward user message to admin
  await forwardToAdmin(message, botToken, adminId, userId, username, fullName);

  // Send confirmation to user
  await sendMessage(botToken, chatId, '✅ Your message has been delivered.');
}

/**
 * Forward user message to admin with user identification
 */
async function forwardToAdmin(message, botToken, adminId, userId, username, fullName) {
  const userInfo = `👤 From: ${fullName}\n🆔 ID: ${userId}\n👨‍💼 Username: @${username}\n${'─'.repeat(30)}\n`;

  // Handle text messages
  if (message.text) {
    const messageText = userInfo + message.text;
    await sendMessage(botToken, adminId, messageText);
    return;
  }

  // Handle photos
  if (message.photo) {
    const photo = message.photo[message.photo.length - 1]; // Get highest resolution
    const caption = userInfo + (message.caption || '');
    await sendPhoto(botToken, adminId, photo.file_id, caption);
    return;
  }

  // Handle videos
  if (message.video) {
    const caption = userInfo + (message.caption || '');
    await sendVideo(botToken, adminId, message.video.file_id, caption);
    return;
  }

  // Handle documents
  if (message.document) {
    const caption = userInfo + (message.caption || '');
    await sendDocument(botToken, adminId, message.document.file_id, caption);
    return;
  }

  // Handle voice messages
  if (message.voice) {
    await sendVoice(botToken, adminId, message.voice.file_id, userInfo);
    return;
  }

  // Handle other message types
  await sendMessage(botToken, adminId, userInfo + '[Unsupported message type received]');
}

/**
 * Handle admin's reply to user messages
 */
async function handleAdminReply(message, botToken, adminId) {
  const replyTo = message.reply_to_message;
  
  // Extract user ID from the original message
  const originalText = replyTo.text || replyTo.caption || '';
  const userIdMatch = originalText.match(/🆔 ID: (\d+)/);
  
  if (!userIdMatch) {
    await sendMessage(botToken, adminId, '❌ Could not find user ID in the original message.');
    return;
  }

  const targetUserId = userIdMatch[1];
  const replyText = message.text;

  // Send admin's reply to the user
  if (replyText) {
    await sendMessage(botToken, targetUserId, replyText);
    await sendMessage(botToken, adminId, '✅ Reply sent to user.');
  } else if (message.photo) {
    const photo = message.photo[message.photo.length - 1];
    await sendPhoto(botToken, targetUserId, photo.file_id, message.caption || '');
    await sendMessage(botToken, adminId, '✅ Photo sent to user.');
  } else if (message.video) {
    await sendVideo(botToken, targetUserId, message.video.file_id, message.caption || '');
    await sendMessage(botToken, adminId, '✅ Video sent to user.');
  } else if (message.document) {
    await sendDocument(botToken, targetUserId, message.document.file_id, message.caption || '');
    await sendMessage(botToken, adminId, '✅ Document sent to user.');
  }
}

/**
 * Send text message via Telegram API
 */
async function sendMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    })
  });
}

/**
 * Send photo via Telegram API
 */
async function sendPhoto(botToken, chatId, photoId, caption) {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoId,
      caption: caption
    })
  });
}

/**
 * Send video via Telegram API
 */
async function sendVideo(botToken, chatId, videoId, caption) {
  const url = `https://api.telegram.org/bot${botToken}/sendVideo`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      video: videoId,
      caption: caption
    })
  });
}

/**
 * Send document via Telegram API
 */
async function sendDocument(botToken, chatId, documentId, caption) {
  const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: documentId,
      caption: caption
    })
  });
}

/**
 * Send voice message via Telegram API
 */
async function sendVoice(botToken, chatId, voiceId, caption) {
  const url = `https://api.telegram.org/bot${botToken}/sendVoice`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      voice: voiceId,
      caption: caption
    })
  });
}
