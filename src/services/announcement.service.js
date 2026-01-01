import Announcement from '../models/Announcement.js';
import notificationService from './notification.service.js';

/**
 * Create a announcement
 * @param {Object} announcementBody
 * @returns {Promise<Announcement>}
 */
const createAnnouncement = async (announcementBody) => {
  const announcement = await Announcement.create(announcementBody);
  
  // Check if it should trigger immediate notification
  // Active AND Start Date is Past/Present
  const now = new Date();
  const isImmediatelyActive = announcement.isActive && 
      (!announcement.startDate || new Date(announcement.startDate) <= now);

  if (isImmediatelyActive && !announcement.isNotificationSent) {
      // Fire and forget notification (or await if critical)
      notificationService.scheduleAnnouncementNotifications(announcement).catch(err => {
          console.error('Initial Notification Trigger Failed', err);
      });
      
      // Update flag
      announcement.isNotificationSent = true;
      await announcement.save();
  }

  return announcement;
};

/**
 * Query for announcements
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryAnnouncements = async (filter, options) => {
  // Simple find for now, ignoring options pagination for this step unless needed strictly
  // but keeping signature consistent
  const announcements = await Announcement.find(filter).sort({ startDate: -1 });
  return announcements;
};

/**
 * Get announcement by id
 * @param {ObjectId} id
 * @returns {Promise<Announcement>}
 */
const getAnnouncementById = async (id) => {
  return Announcement.findById(id);
};

/**
 * Update announcement by id
 * @param {ObjectId} announcementId
 * @param {Object} updateBody
 * @returns {Promise<Announcement>}
 */
const updateAnnouncementById = async (announcementId, updateBody) => {
  const announcement = await getAnnouncementById(announcementId);
  if (!announcement) {
    throw new Error('Announcement not found');
  }
  Object.assign(announcement, updateBody);
  await announcement.save();
  return announcement;
};

/**
 * Delete announcement by id
 * @param {ObjectId} announcementId
 * @returns {Promise<Announcement>}
 */
const deleteAnnouncementById = async (announcementId) => {
  const announcement = await getAnnouncementById(announcementId);
  if (!announcement) {
    throw new Error('Announcement not found');
  }
  await announcement.deleteOne();
  return announcement;
};

export default {
  createAnnouncement,
  queryAnnouncements,
  getAnnouncementById,
  updateAnnouncementById,
  deleteAnnouncementById,
};
