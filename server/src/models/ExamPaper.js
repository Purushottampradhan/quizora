import mongoose from 'mongoose';

const paperSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    slug: { type: String, required: true, unique: true },
    title: { type: String, default: 'Full exam' },
    mode: { type: String, enum: ['exam', 'practice', 'read'], default: 'exam' },
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    durationMinutes: { type: Number },
    plusMark: { type: Number, default: 1 },
    minusMark: { type: Number, default: 0 },
    selectionType: { type: String, enum: ['all', 'range', 'count', 'manual'], default: 'all' },
    rangeStart: { type: Number, default: null },
    rangeEnd: { type: Number, default: null },
    pickCount: { type: Number, default: null },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    isActive: { type: Boolean, default: true },
    allowMultipleAttempts: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ExamPaper = mongoose.model('ExamPaper', paperSchema);
