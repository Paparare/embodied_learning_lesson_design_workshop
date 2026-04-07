# Embodied AI-ED Studio — Workshop Deployment

A live, multi-user web app for K–12 teacher PD on embodied learning with AI. Teachers join from any phone or laptop, build mini-lessons by transforming AI-generated activities into embodied versions, share them to a live gallery, and play each other's lessons as students.

This is the **deployable version** that runs on Vercel with a Vercel KV store. Unlike the artifact version, **teachers do not need a Claude account** — the API key lives on the server, and you (the workshop facilitator) pay for the API calls (typically a few dollars for a 25-person workshop).

## What you'll need

- A free **Vercel** account ([sign up](https://vercel.com/signup))
- A free **GitHub** account ([sign up](https://github.com/signup))
- A free **Anthropic API** account with a small amount of credit ([sign up](https://console.anthropic.com/))
- About **30–60 minutes** the first time you deploy

You do **not** need to install Node.js, run any commands, or write any code. Everything is point-and-click after the initial GitHub upload.

## Step-by-step deployment

### Step 1 — Create an Anthropic API key with a spending limit

This is the single most important safety step. **Do this first.** A spending limit means a leaked key cannot drain your account.

1. Go to [console.anthropic.com](https://console.anthropic.com/) and sign in.
2. Add at least **$10 of credit** to your account (Settings → Billing).
3. Go to **Settings → Limits** and set a **monthly spending limit of $10** (or whatever you're comfortable losing in the worst case).
4. Go to **Settings → API Keys** and click **Create Key**. Name it `embodied-workshop`. Copy the key (it starts with `sk-ant-api03-...`) and paste it somewhere safe — you will not be able to see it again.

The workshop should cost roughly **$2–5** for 25 teachers. The $10 limit is there as a hard cap.

### Step 2 — Put the project on GitHub

1. Go to [github.com/new](https://github.com/new) and create a new repository. Name it `embodied-aied-workshop`. Leave it set to **Public** (Vercel can deploy from public repos with the simplest setup). Do not initialize with a README.
2. On the next page, GitHub will show you a URL like `https://github.com/yourusername/embodied-aied-workshop.git`. Keep this tab open.
3. The easiest way to upload the project files: on the empty repo page, click **uploading an existing file** in the "Quick setup" section. This opens a drag-and-drop uploader.
4. Drag the entire **contents** of the `embodied-aied-vercel` folder into the uploader. (Drag the files inside the folder, not the folder itself, so that `package.json` ends up at the repo root.) Make sure these are present:
   - `package.json`
   - `next.config.js`
   - `.gitignore`
   - `.env.local.example`
   - `app/` folder
   - `components/` folder
   - `README.md`
5. Scroll down and click **Commit changes**.

If you're already comfortable with `git`, the equivalent command-line version is just `git init && git add . && git commit -m "initial" && git remote add origin <url> && git push -u origin main`.

### Step 3 — Import the project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and sign in.
2. You'll see a list of your GitHub repositories. Click **Import** next to `embodied-aied-workshop`. (If you don't see it, click "Add GitHub Account" and grant Vercel access to your repos.)
3. Vercel will detect this is a Next.js project automatically. **Don't change any of the default build settings.**
4. **Before clicking Deploy**, expand the **Environment Variables** section and add one variable:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: paste the API key from Step 1 (the `sk-ant-api03-...` string)
5. Click **Deploy**.

Vercel will spend about a minute building and deploying. When it's done, you'll see a "Congratulations!" screen with a link to your live site (something like `embodied-aied-workshop.vercel.app`).

**Don't share the link yet** — there's one more step.

### Step 4 — Connect a Vercel KV store

The app needs a key-value database to store the shared lesson gallery. Vercel KV's free tier is more than enough for a workshop.

1. From your Vercel dashboard, click on your `embodied-aied-workshop` project.
2. Click the **Storage** tab at the top.
3. Click **Create Database** → choose **KV** (Redis-backed key-value store).
4. Give it any name (e.g. `embodied-kv`) and choose the region closest to your audience. Click **Create**.
5. On the next screen, click **Connect Project**. Vercel will automatically inject the connection environment variables (`KV_REST_API_URL` and `KV_REST_API_TOKEN`) into your project. You don't need to copy or paste anything.
6. Vercel will tell you a redeploy is needed for the new variables to take effect. Go to the **Deployments** tab, find the latest deployment, click the three-dot menu, and pick **Redeploy**.

After the redeploy finishes (about 30 seconds), your site is live and ready.

### Step 5 — Test it before the workshop

1. Open your live URL (`https://embodied-aied-workshop.vercel.app` or similar) in your browser.
2. Enter a name on the onboarding screen.
3. Try the full flow: build a lesson, generate full content, publish it, and play the example lesson from the gallery.
4. **Open the same URL in a second browser** (or an incognito window) and enter a *different* name. You should see your own lesson appear in the second browser within 10 seconds.
5. If both work, you're ready.

If anything fails, check the **Troubleshooting** section below before the workshop.

### Step 6 — Run the workshop

Share the URL with teachers however you like (slide, QR code, chat). Teachers visit the URL on their phone or laptop, enter a name, and they're in. No login, no install, no Claude account needed.

### Step 7 — After the workshop, revoke the key

This is important. Don't skip it.

1. Go to [console.anthropic.com](https://console.anthropic.com/) → Settings → API Keys.
2. Find the `embodied-workshop` key and click **Delete** (or **Revoke**).
3. Optionally, in Vercel, go to your project → Settings → Environment Variables and delete `ANTHROPIC_API_KEY`. This way, even if someone re-uses the URL later, no API calls can succeed.

If you want to run the workshop again later, just create a new key and paste it back into the env var.

## Cost expectations

Each teacher building one lesson typically uses ~10 Claude API calls of ~1500 tokens each. With Sonnet 4.5 pricing (~$3 per million input tokens, ~$15 per million output tokens), that's roughly **$0.10–0.20 per teacher**. For a 25-person workshop, expect a total bill of **$2–5**.

Vercel KV's free tier covers 30,000 commands per month. A 25-teacher workshop will use maybe 2,000 commands. You're nowhere near the limit.

Vercel hosting is free for hobby projects. You won't be charged anything for the deployment itself.

## Troubleshooting

### "Couldn't generate pieces" or "AI didn't return anything"
The most common cause is the `ANTHROPIC_API_KEY` env var is missing or wrong. Check Vercel → your project → Settings → Environment Variables. Make sure the key starts with `sk-ant-api03-` and is set for the **Production** environment. If you change it, you must redeploy (Deployments → Redeploy).

### "Couldn't save your lesson" or the gallery is empty
This usually means Vercel KV isn't connected. Check Vercel → your project → Storage tab. If no KV database is listed, repeat Step 4. After connecting, redeploy.

### Lessons don't show up in other browsers
Check that both browsers can reach the same URL (no typos). The poll interval is 10 seconds, so wait that long, or click the **↻ Refresh** button in the gallery. If still nothing, check your browser console (F12 → Console) for red errors.

### Build fails on Vercel with "Module not found"
Make sure all the files were uploaded to GitHub, especially `package.json`, the `app/` folder, and the `components/` folder. The `package.json` must be at the **root** of the repo, not inside a subfolder.

### "Rate limit exceeded" during the workshop
Anthropic enforces per-minute token limits on the API. With 25 teachers all clicking "Generate Full Lesson" within the same minute, you might briefly hit it. The app retries automatically with backoff, so most calls will succeed. If you see widespread failures, ask teachers to stagger their clicks.

### I want to clear all the lessons between workshops
Triple-click the title bar to enable Facilitator Mode, then go to the **Debrief** tab and click **Clear Gallery**.

## What's in this project

```
embodied-aied-vercel/
├── package.json                          ← project dependencies
├── next.config.js                        ← Next.js config (minimal)
├── .gitignore                            ← files to skip in git
├── .env.local.example                    ← env var template
├── README.md                             ← this file
├── app/
│   ├── layout.js                         ← root HTML layout, loads Google Fonts
│   ├── page.js                           ← mounts the main React component
│   ├── globals.css                       ← minimal CSS reset
│   └── api/
│       ├── claude/route.js               ← server proxy to Anthropic API
│       └── storage/route.js              ← server proxy to Vercel KV
└── components/
    └── EmbodiedAiedStudio.jsx            ← the entire app (~4500 lines)
```

The two **API routes** are the only server-side code. They're tiny (~50 lines each) and exist purely to keep the API key off the client and to provide a shared persistence layer.

The **React component** is the entire app, ported from the artifact version. It uses two thin shims (`callClaude` for AI and `kvStorage` for storage) that POST to the server routes.

## Security notes

- The Anthropic API key lives **only** in the `ANTHROPIC_API_KEY` server env var. It is never sent to the browser or included in the JavaScript bundle.
- The `/api/storage` endpoint is intentionally simple and unauthenticated. Anyone who knows your URL can read or write the gallery. This is fine for a workshop where you trust your teachers, but don't share the URL publicly.
- The `/api/claude` endpoint is also unauthenticated. With your spending cap and key revocation discipline (Step 7), the worst case is bounded.
- For a more production-ready deployment, add a shared password to both endpoints. Tell me if you want me to add that.

## Differences from the artifact version

If you've used the artifact (Claude.ai) version:

- **No Claude subscription needed for users** — the server holds the key.
- **`localStorage` for user identity** instead of `window.storage`. Each browser remembers its name across page reloads, but two browsers don't share identity.
- **No legacy `lessons:all` migration** — fresh deploy, no migration needed.
- **Same gallery, same example lesson, same facilitator view** — all features carry over.

## Questions?

The whole project is small enough to read end-to-end. The two API routes are commented heavily; the component file is the same one from the artifact, ported. If something breaks during your test run, the browser console (F12) and the Vercel deployment logs (Vercel → your project → Deployments → click any deployment → Logs) will tell you what happened.
