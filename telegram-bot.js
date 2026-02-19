/**
 * የቴሌግራም አስተያየት መቀበያ ቦት (Telegram Feedback Bot)
 * ለ Cloudflare Workers የተዘጋጀ
 */

export default {
  async fetch(request, env) {
    const { BOT_TOKEN, ADMIN_ID } = env;

    if (!BOT_TOKEN || !ADMIN_ID) {
      return new Response('BOT_TOKEN ወይም ADMIN_ID አልተገኘም!', { status: 500 });
    }

    // የዌብሁክ (Webhook) ዝግጅትን ለመፈተሽ
    if (request.method === 'GET') {
      return new Response('ቦቱ በትክክል እየሰራ ነው!', { status: 200 });
    }

    // ከቴሌግራም የሚመጡ መልዕክቶችን ለማስተናገድ
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        await handleUpdate(update, BOT_TOKEN, ADMIN_ID);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error:', error);
        return new Response('ስህተት ተፈጥሯል', { status: 500 });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
};

/**
 * ገቢ መልዕክቶችን መለየት እና ማስተናገድ
 */
async function handleUpdate(update, botToken, adminId) {
  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const userId = message.from.id;
  const username = message.from.username ? `@${message.from.username}` : 'ዩዘርኔም የለውም';
  const fullName = `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim();

  // /start ትዕዛዝ ሲላክ - ስልክ ቁጥር እንዲልኩ መጠየቂያ
  if (message.text === '/start') {
    const keyboard = {
      keyboard: [[{ text: "📲 ስልክ ቁጥርህን ላክ (Share Contact)", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    };
    await sendMessage(botToken, chatId, '👋 ሰላም! እንኳን ደህና መጡ። ቦቱን ለመጠቀም መጀመሪያ እባክዎ ከታች ያለውን በተን ተጭነው ስልክ ቁጥርዎን ያጋሩ።', keyboard);
    return;
  }

  // ስልክ ቁጥር ሲላክ ወደ አስተዳዳሪ ማስተላለፍ
  if (message.contact) {
    const phone = message.contact.phone_number;
    const contactInfo = `👤 <b>አዲስ ተጠቃሚ ስልክ ቁጥር ልኳል:</b>\n\n👤 ስም: ${fullName}\n📞 ስልክ: ${phone}\n🆔 ID: <code>${userId}</code>`;
    await sendMessage(botToken, adminId, contactInfo);
    await sendMessage(botToken, chatId, '✅ ስልክ ቁጥርዎ ተመዝግቧል። አሁን መልዕክትዎን፣ ፎቶ፣ ቪዲዮ ወይም ስቲከር መላክ ይችላሉ።');
    return;
  }

  // አስተዳዳሪው ለተጠቃሚ መልስ ሲሰጥ (Reply ሲያደርግ)
  if (userId.toString() === adminId.toString() && message.reply_to_message) {
    await handleAdminReply(message, botToken, adminId);
    return;
  }

  // አስተዳዳሪው ዝም ብሎ መልዕክት ከላከ ችላ እንዲለው
  if (userId.toString() === adminId.toString()) {
    return;
  }

  // የተጠቃሚውን መልዕክት (sticker ጨምሮ) ወደ አስተዳዳሪ ማስተላለፍ
  await forwardToAdmin(message, botToken, adminId, userId, username, fullName);

  // ለተጠቃሚው ማረጋገጫ መላክ (ከስቲከር ውጭ ላሉት)
  await sendMessage(botToken, chatId, '✅ መልዕክትዎ ደርሷል። እናመሰግናለን!');
}

/**
 * መልዕክቶችን ወደ አስተዳዳሪው መላኪያ ተግባር
 */
async function forwardToAdmin(message, botToken, adminId, userId, username, fullName) {
  const userInfo = `👤 <b>ከ:</b> ${fullName}\n🆔 <b>መለያ (ID):</b> <code>${userId}</code>\n🔗 <b>ዩዘርኔም:</b> ${username}\n${'━'.repeat(15)}\n`;

  if (message.text) {
    await sendMessage(botToken, adminId, userInfo + message.text);
  } else if (message.photo) {
    const photoId = message.photo[message.photo.length - 1].file_id;
    await sendPhoto(botToken, adminId, photoId, userInfo + (message.caption || ''));
  } else if (message.video) {
    await sendVideo(botToken, adminId, message.video.file_id, userInfo + (message.caption || ''));
  } else if (message.document) {
    await sendDocument(botToken, adminId, message.document.file_id, userInfo + (message.caption || ''));
  } else if (message.voice) {
    await sendVoice(botToken, adminId, message.voice.file_id, userInfo);
  } else if (message.sticker) {
    // ስቲከር ሲላክ መጀመሪያ መረጃውን ልኮ ቀጥሎ ስቲከሩን ይልካል
    await sendMessage(botToken, adminId, userInfo + "👆 [ተጠቃሚው ስቲከር ልኳል]");
    await sendSticker(botToken, adminId, message.sticker.file_id);
  } else {
    await sendMessage(botToken, adminId, userInfo + '[የማይደገፍ የፋይል አይነት ተልኳል]');
  }
}

/**
 * አስተዳዳሪው ለተላከለት መልዕክት Reply ሲያደርግ ለተጠቃሚው መላክ
 */
async function handleAdminReply(message, botToken, adminId) {
  const replyTo = message.reply_to_message;
  const originalText = replyTo.text || replyTo.caption || '';
  const userIdMatch = originalText.match(/መለያ \(ID\): (\d+)/);
  
  if (!userIdMatch) {
    await sendMessage(botToken, adminId, '❌ የተጠቃሚውን መለያ (ID) ማግኘት አልቻልኩም። እባክዎ መልዕክቱን Reply ማድረጎን ያረጋግጡ።');
    return;
  }

  const targetUserId = userIdMatch[1];

  if (message.text) {
    await sendMessage(botToken, targetUserId, `<b>ከአስተዳዳሪው የተላከ መልስ:</b>\n\n${message.text}`);
    await sendMessage(botToken, adminId, '✅ መልሱ ለተጠቃሚው ተልኳል።');
  } else if (message.photo) {
    const photoId = message.photo[message.photo.length - 1].file_id;
    await sendPhoto(botToken, targetUserId, photoId, `<b>ከአስተዳዳሪው የተላከ ምስል:</b>\n${message.caption || ''}`);
    await sendMessage(botToken, adminId, '✅ ምስሉ ለተጠቃሚው ተልኳል።');
  } else if (message.sticker) {
    await sendSticker(botToken, targetUserId, message.sticker.file_id);
    await sendMessage(botToken, adminId, '✅ ስቲከሩ ለተጠቃሚው ተልኳል።');
  }
}

// --- የቴሌግራም API ረዳት ተግባራት (Helper Functions) ---

async function sendMessage(botToken, chatId, text, replyMarkup = null) {
  const body = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  
  return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function sendPhoto(botToken, chatId, photoId, caption) {
  return fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoId, caption: caption, parse_mode: 'HTML' })
  });
}

async function sendSticker(botToken, chatId, stickerId) {
  return fetch(`https://api.telegram.org/bot${botToken}/sendSticker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, sticker: stickerId })
  });
}

async function sendVideo(botToken, chatId, videoId, caption) {
  return fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, video: videoId, caption: caption, parse_mode: 'HTML' })
  });
}

async function sendDocument(botToken, chatId, documentId, caption) {
  return fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, document: documentId, caption: caption, parse_mode: 'HTML' })
  });
}

async function sendVoice(botToken, chatId, voiceId, caption) {
  return fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, voice: voiceId, caption: caption, parse_mode: 'HTML' })
  });
}
