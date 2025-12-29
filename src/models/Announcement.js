import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
      default: 'NORMAL',
    },
    targetAudience: {
      role: { type: String, enum: ['all', 'user', 'sub-broker'], default: 'all' },
      planValues: [String], // e.g. ['pro', 'enterprise']
    },
    isActive: {
       type: Boolean,
       default: true,
    }
  },
  {
    timestamps: true,
  }
);

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;
