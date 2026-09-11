import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    questionText: { type: String, required: true },
    optionA: { type: String, required: true },
    optionB: { type: String, required: true },
    optionC: { type: String, required: true },
    optionD: { type: String, required: true },
    correctAnswer: { type: String, required: true, enum: ['A', 'B', 'C', 'D'] },
    explanation: { type: String, default: '' },
    remark: { type: String, default: '' },
    orderIndex: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Question = mongoose.model('Question', questionSchema);
