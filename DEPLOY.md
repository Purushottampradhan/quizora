# Deploy Quizora on Render (frontend + backend)

You will create **two free Render services** from the same GitHub repo:

| Service | Type | Folder | Public URL example |
|---|---|---|---|
| API | Web Service | `server/` | `https://quizora-api.onrender.com` |
| App | Static Site | `client/` | `https://quizora-web.onrender.com` |

Database and login live on **MongoDB Atlas** (database name `quiz`). AI tips stay on **Groq**. Render only hosts the website and the Express API.

The free API **sleeps after idle time**. The first request after that can take 30–60 seconds. Atlas M0 does **not** pause the way some hosted Postgres plans do.

---

## 0. Push this folder to GitHub

Render deploys from GitHub. The repo **root must be this `quizora` folder** (the one that contains `client/`, `server/`, and `render.yaml`).

```bash
cd quizora
git init
git add .
git commit -m "Deploy Quizora"
```

Create a new empty repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USER/quizora.git
git branch -M main
git push -u origin main
```

Do **not** commit `.env` or Atlas credential files. They are already gitignored.

---

## 1. MongoDB Atlas (before Render)

1. Open your Atlas cluster → **Network Access** → allow `0.0.0.0/0` (Render IPs are not fixed on the free plan).
2. Database user can read/write.
3. Connection string must include `/quiz` as the database name.

---

## 2. Deploy the API (backend)

1. Open [dashboard.render.com](https://dashboard.render.com/) and sign in with GitHub.
2. **New +** → **Web Service** → pick the `quizora` repo.
3. Settings:

   | Field | Value |
   |---|---|
   | Name | `quizora-api` |
   | Language | Node |
   | Branch | `main` |
   | Root Directory | `server` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance type | **Free** |

4. Environment variables:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/quiz?retryWrites=true&w=majority&appName=Cluster0` |
   | `JWT_SECRET` | a long random string (not the Mongo password) |
   | `ADMIN_EMAIL` | first admin email (only used if the `users` collection is empty) |
   | `ADMIN_PASSWORD` | first admin password |
   | `GROQ_API_KEY` | your Groq key |
   | `GROQ_MODEL` | `openai/gpt-oss-20b` |
   | `CLIENT_URL` | leave as `https://quizora-web.onrender.com` for now, then fix after the frontend exists |

   **Delete these if they are still on the service** (they are unused now):

   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

5. Click **Deploy**. When it is live, open:

   `https://quizora-api.onrender.com/api/health`

   You should see `{"ok":true,"name":"quizora"}`. Copy the API URL (no trailing slash).

---

## 3. Deploy the app (frontend)

1. In Render: **New +** → **Static Site** → same `quizora` repo.
2. Settings:

   | Field | Value |
   |---|---|
   | Name | `quizora-web` |
   | Branch | `main` |
   | Root Directory | `client` |
   | Build Command | `npm install && npm run build` |
   | Publish Directory | `dist` |

3. **Required — SPA rewrite** (without this, `/e/your-exam` and refresh on `/admin/...` show Render’s “Not Found”):

   Open the **quizora-web** service → **Redirects/Rewrites** → **Add Rule**:

   | Field | Value |
   |---|---|
   | Source | `/*` |
   | Destination | `/index.html` |
   | Action | **Rewrite** (not Redirect) |

   Save. You do **not** need to rebuild. Then open the student link again.

   `client/public/_redirects` is ignored by Render (it is only a Netlify-style file). The dashboard rule is what actually works.

4. Environment variables (baked in at **build** time):

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://quizora-api.onrender.com` (your real API URL) |
   | `VITE_SITE_URL` | `https://quizora-web.onrender.com` (your real frontend URL) |

   **Delete these if they are still on the static site**, then **rebuild**:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

5. Click **Deploy**. Copy the frontend URL.

---

## 4. Point the two services at each other

1. **API** → Environment → set `CLIENT_URL` to the frontend URL  
   (`https://quizora-web.onrender.com`, no trailing slash) → **Save** (it will redeploy).
2. **Frontend** → Environment → set `VITE_API_URL` and `VITE_SITE_URL` to the real URLs if the first guess was wrong → **Save**. Static sites must **rebuild** after changing any `VITE_` variable.

---

## 5. Check it

1. `https://quizora-api.onrender.com/api/health` → `ok`
2. `https://quizora-web.onrender.com` → home page
3. `/admin/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
4. Create an exam, copy the public link, take it, submit, confirm AI tips

If the frontend loads but submit/login fails, `VITE_API_URL` is missing or the API is asleep — wait and retry.

Existing exams, questions, share links, and attempts are already in MongoDB `quiz`. Student `/e/:slug` links stay the same.

---

## Blueprint (optional)

If the GitHub repo root is this `quizora` folder, you can instead use **New +** → **Blueprint** and select `render.yaml`. Fill in the `sync: false` env vars when Render asks, then do step 4 so the two URLs match.
