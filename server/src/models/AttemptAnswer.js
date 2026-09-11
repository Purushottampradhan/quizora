import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true, index: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedOption: { type: String, default: null },
    isCorrect: { type: Boolean, default: null },
    timeSpentMs: { type: Number, default: 0 },
    answeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

answerSchema.index({ attemptId: 1, questionId: 1 }, { unique: true });

export const AttemptAnswer = mongoose.model('AttemptAnswer', answerSchema);
