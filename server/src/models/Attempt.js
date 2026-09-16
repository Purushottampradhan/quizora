import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamPaper', default: null },
    candidateName: { type: String, required: true },
    nameKey: { type: String, default: '', index: true },
    clientIp: { type: String, default: '', index: true },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    timeTakenMs: { type: Number, default: 0 },
    aiSuggestions: { type: [String], default: [] },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    optionMaps: { type: mongoose.Schema.Types.Mixed, default: {} },
    mode: { type: String, enum: ['exam', 'practice'], default: 'exam' },
    plusMark: { type: Number, default: 1 },
    minusMark: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: null },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    skipCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Attempt = mongoose.model('Attempt', attemptSchema);
