import mongoose from 'mongoose';

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    segment: {
      type: String,
      enum: ['EQUITY', 'FNO', 'COMMODITY', 'CURRENCY'],
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    durationDays: {
      type: Number,
      required: true, // e.g., 30, 90, 365
    },
    features: [
      {
        type: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Plan = mongoose.model('Plan', planSchema);

export default Plan;
