import logger from '../config/logger.js';

const sendEmail = async (to, subject, text) => {
  // In production, use verified SendGrid/SES
  logger.info(`[MOCK EMAIL] To: ${to}, Subject: ${subject}, Body: ${text}`);
  return true;
};

const sendPushNotification = async (tokens, title, body) => {
    // In production, use firebase-admin
    logger.info(`[MOCK PUSH] To: ${tokens.length} devices, Title: ${title}, Body: ${body}`);
    return true;
};

export {
  sendEmail,
  sendPushNotification,
};
