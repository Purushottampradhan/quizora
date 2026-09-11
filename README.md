# Quizora

Mobile-friendly MCQ exam platform: React + Express + MongoDB Atlas, with Groq AI study tips after each attempt.

## What you get

**Admin (3 screens)**
1. Sign in
2. Dashboard — create exams, copy the public link
3. Exam page — upload questions (JSON / CSV / Excel), add a single question, see every attempt with total time and time per question

**Student (3 screens)**
1. Enter name and start
2. Tap an option → next unanswered question opens. Jump via the number bar. Progress: total / done / left
3. Submit → score, your answer vs correct + explanation, then 2–3 AI tips

## Setup

### 1. MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a database user and set **Network Access** to allow `0.0.0.0/0` (so Render can connect)
3. Connection string must use database name **`quiz`**:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/quiz?retryWrites=true&w=majority&appName=Cluster0
```

The first API start creates collections automatically. If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and no admin exists yet, that account is created. Signups stay disabled.

### 2. Groq (AI tips)

Create an API key at [console.groq.com/keys](https://console.groq.com/keys). After submit, Groq writes 2–3 tips from the student's answers. Quizora uses `openai/gpt-oss-20b` by default (`GROQ_MODEL` in `.env`). Older Llama 3.1 / 3.3 IDs are retired on Groq.

### 3. Environment

Copy `.env.example` to `.env` in this folder (`quizora/.env`). The Vite `VITE_*` keys are enough for the client — the API reads the same file.

```
VITE_SITE_URL=http://localhost:5173
VITE_API_URL=
PORT=5050
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/quiz?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=long-random-string
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=your-admin-password
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
```

### 4. Run

```bash
cd quizora
npm install
npm run install:all
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:5050/api/health

To put both the website and the API on Render’s free plan, follow [DEPLOY.md](./DEPLOY.md).

Sign in at `/admin/login`, create an exam, upload `samples/sample-questions.json` (or the CSV), copy the link, and take the quiz on your phone or desktop.

## Question file format

Required columns (header names are flexible):

| Column | Meaning |
|---|---|
| question | Stem |
| option_a / option_b / option_c / option_d | Four choices |
| correct_answer | `A`, `B`, `C`, or `D` (or the option text) |
| explanation | Shown after submit |
| remark | Admin-only note |

JSON is an array of those objects. Excel uses the first sheet. A template download is on the exam page.

## Pages (kept small)

| Who | Route | Purpose |
|---|---|---|
| Anyone | `/` | Product home |
| Admin | `/admin/login` | Sign in (signups disabled) |
| Admin | `/admin` | Exams + create + copy link |
| Admin | `/admin/exams/:id` | Questions, attempts, share, settings |
| Student | `/e/:slug` | Name + start |
| Student | `/e/:slug/quiz/:attemptId` | Take exam |
| Student | `/e/:slug/result/:attemptId` | Review + AI tips |
