# Deploy Quizora on Render (frontend + backend)

You will create **two free Render services** from the same GitHub repo:

| Service | Type | Folder | Public URL example |
|---|---|---|---|
| API | Web Service | `server/` | `https://quizora-api.onrender.com` |
| App | Static Site | `client/` | `https://quizora-web.onrender.com` |

Database and login stay on **Supabase**. AI tips stay on **Groq**. Render only hosts the website and the Express API.

The free API **sleeps after idle time**. The first request after that can take 30–60 seconds.

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

Do **not** commit `.env`. It is already gitignored.

---

## 1. Deploy the API (backend)

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

4. Environment variables (copy from your local `quizora/.env`):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SUPABASE_URL` | same as local |
   | `SUPABASE_ANON_KEY` | same as local |
   | `GROQ_API_KEY` | your Groq key |
   | `GROQ_MODEL` | `openai/gpt-oss-20b` |
   | `CLIENT_URL` | leave as `https://quizora-web.onrender.com` for now, then fix after the frontend exists |

5. Click **Deploy**. When it is live, open:

   `https://quizora-api.onrender.com/api/health`

   You should see `{"ok":true,"name":"quizora"}`. Copy the API URL (no trailing slash).

---

## 2. Deploy the app (frontend)

1. In Render: **New +** → **Static Site** → same `quizora` repo.
2. Settings:

   | Field | Value |
   |---|---|
   | Name | `quizora-web` |
   | Branch | `main` |
   | Root Directory | `client` |
   | Build Command | `npm install && npm run build` |
   | Publish Directory | `dist` |

3. Redirects/rewrites: **Rewrite** `/*` → `/index.html`  
   (needed so `/admin/login` and `/e/your-exam` work). `client/public/_redirects` is already in the repo.

4. Environment variables (baked in at **build** time):

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | same as `SUPABASE_URL` |
   | `VITE_SUPABASE_ANON_KEY` | same as `SUPABASE_ANON_KEY` |
   | `VITE_API_URL` | `https://quizora-api.onrender.com` (your real API URL) |
   | `VITE_SITE_URL` | `https://quizora-web.onrender.com` (your real frontend URL) |

5. Click **Deploy**. Copy the frontend URL.

---

## 3. Point the two services at each other

1. **API** → Environment → set `CLIENT_URL` to the frontend URL  
   (`https://quizora-web.onrender.com`, no trailing slash) → **Save** (it will redeploy).
2. **Frontend** → Environment → set `VITE_API_URL` and `VITE_SITE_URL` to the real URLs if the first guess was wrong → **Save**. Static sites must **rebuild** after changing any `VITE_` variable.

---

## 4. Allow the site in Supabase

In [Supabase](https://supabase.com/dashboard) → your project → **Authentication** → **URL Configuration**:

- Site URL: `https://quizora-web.onrender.com`
- Redirect URLs: add  
  `https://quizora-web.onrender.com/**`

If signup still says “Database error saving new user”, run `supabase/fix-signup.sql` in the SQL editor.

---

## 5. Check it

1. `https://quizora-api.onrender.com/api/health` → `ok`
2. `https://quizora-web.onrender.com` → home page
3. `/admin/signup` or `/admin/login`
4. Create an exam, copy the public link, take it, submit, confirm AI tips

If the frontend loads but submit/login fails, `VITE_API_URL` is missing or the API is asleep — wait and retry.

---

## Blueprint (optional)

If the GitHub repo root is this `quizora` folder, you can instead use **New +** → **Blueprint** and select `render.yaml`. Fill in the `sync: false` env vars when Render asks, then do steps 3–4 so the two URLs match.
