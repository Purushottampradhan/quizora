import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    kind: { type: String, enum: ['ip', 'name'], required: true },
    value: { type: String, required: true, trim: true },
    label: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

blockSchema.index({ examId: 1, kind: 1, value: 1 }, { unique: true });

export const ExamBlock = mongoose.model('ExamBlock', blockSchema);
