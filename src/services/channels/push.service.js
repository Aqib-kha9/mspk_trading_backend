import axios from 'axios';
import logger from '../../config/logger.js';

const sendPushNotification = async (serverKey, tokens, title, body, data = {}) => {
    try {
        if (!serverKey) {
            throw new Error('Missing FCM Server Key');
        }

        if (!tokens || tokens.length === 0) {
            logger.warn('No FCM tokens provided for push notification');
            return false;
        }

        const url = 'https://fcm.googleapis.com/fcm/send';

        const payload = {
            registration_ids: tokens,
            notification: {
                title: title,
                body: body,
                sound: 'default'
            },
            data: data, // Custom data payload
            priority: 'high'
        };

        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `key=${serverKey}`,
                'Content-Type': 'application/json'
            }
        });

        logger.info(`Push notification sent. Success: ${response.data.success}, Failure: ${response.data.failure}`);
        return true;
    } catch (error) {
        logger.error('Push Notification Error', error.response?.data || error.message);
        throw error;
    }
};

export default {
    sendPushNotification
};
