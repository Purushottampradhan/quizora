# Quizora

Mobile-friendly MCQ exam platform: React + Express + Supabase, with Groq AI study tips after each attempt.

## What you get

**Admin (3 screens)**
1. Sign up / sign in
2. Dashboard — create exams, copy the public link
3. Exam page — upload questions (JSON / CSV / Excel), add a single question, see every attempt with total time and time per question

**Student (3 screens)**
1. Enter name and start
2. Tap an option → next unanswered question opens. Jump via the number bar. Progress: total / done / left
3. Submit → score, your answer vs correct + explanation, then 2–3 AI tips

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → paste and run `supabase/schema.sql`
3. Open `/admin/signup` and create an account.
   If signup says **Database error saving new user**, run `supabase/fix-signup.sql` in the SQL Editor (this project still has a Connect auth trigger), then try again.
   If confirmation emails are enabled, confirm the inbox link, then sign in at `/admin/login`.

### 2. Groq (AI tips)

Create an API key at [console.groq.com/keys](https://console.groq.com/keys). After submit, Groq writes 2–3 tips from the student's answers. Quizora uses `openai/gpt-oss-20b` by default (`GROQ_MODEL` in `.env`). Older Llama 3.1 / 3.3 IDs are retired on Groq.

### 3. Environment

Copy `.env.example` to `.env` in this folder (`quizora/.env`). The Vite `VITE_*` keys are enough — the API reads the same file.

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your_publishable_or_anon_key
PORT=5050
CLIENT_URL=http://localhost:5173
GROQ_API_KEY=
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
| Admin | `/admin/signup` | Create account |
| Admin | `/admin/login` | Sign in |
| Admin | `/admin` | Exams + create + copy link |
| Admin | `/admin/exams/:id` | Questions, attempts, share, settings |
| Student | `/e/:slug` | Name + start |
| Student | `/e/:slug/quiz/:attemptId` | Take exam |
| Student | `/e/:slug/result/:attemptId` | Review + AI tips |
