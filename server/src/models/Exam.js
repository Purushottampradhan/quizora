import mongoose from 'mongoose';

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    slug: { type: String, required: true, unique: true },
    durationMinutes: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Exam = mongoose.model('Exam', examSchema);
