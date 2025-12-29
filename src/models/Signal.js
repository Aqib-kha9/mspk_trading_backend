import mongoose from 'mongoose';

const signalSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    segment: {
      type: String,
      enum: ['EQUITY', 'FNO', 'COMMODITY', 'CURRENCY'],
      required: true,
    },
    type: {
      type: String,
      enum: ['BUY', 'SELL'],
      required: true,
    },
    entryPrice: {
      type: Number, // Frontend expects single value 'entry'
      required: true,
    },
    stopLoss: {
      type: Number,
      required: true,
    },
    targets: {
      target1: { type: Number, required: true },
      target2: { type: Number },
      target3: { type: Number },
    },
    status: {
      type: String,
      enum: ['Active', 'Target Hit', 'Stoploss Hit', 'Closed'], // Matched Frontend Mock
      default: 'Active',
    },
    report: {
        result: { type: Number }, // P/L Points
        closedAt: { type: Date },
        closedPrice: { type: Number }
    },
    isFree: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
    },
    attachments: [
      {
        type: String, // URL
      },
    ],
    // For admin audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
  },
  {
    timestamps: true,
  }
);

const Signal = mongoose.model('Signal', signalSchema);

export default Signal;
