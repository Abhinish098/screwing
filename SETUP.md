# SETUP.md — The Duel: Complete Setup Guide

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| Python | ≥ 3.11 |
| pip | any recent |

---

## 1. Neon.tech — Create a PostgreSQL Database

1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Click **"New Project"** → give it a name (e.g. `the-duel`).
3. Once created, open **Connection Details** → copy the **Connection string**.
   It looks like:
   ```
   postgresql://alice:abc123@ep-cool-cloud-123.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Keep this string handy — you'll paste it in two places below.

---

## 2. Configure the Server

```bash
cd server
cp .env.example .env
```

Open `server/.env` and fill in:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require  # ← Neon string
JWT_SECRET=your_long_random_secret_here                               # ← generate with: openssl rand -hex 64
PORT=4000
CLIENT_ORIGIN=*                                                       # ← change to your GH Pages URL in production
```

Also paste the same connection string into **`server/db.js`**:
```js
// Line marked: ⚠️ REPLACE THIS
const NEON_CONNECTION_STRING = 'postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require';
```
> If `DATABASE_URL` is set as an env var, `db.js` will use it automatically — the hardcoded line is just a fallback.

---

## 3. Run Database Migrations (Alembic)

Alembic uses Python. Run this from the **root of the repo** (where `alembic.ini` lives):

```bash
# Install dependencies
pip install alembic psycopg2-binary sqlalchemy

# Option A — set env var (preferred)
export DATABASE_URL="postgresql+psycopg2://USER:PASSWORD@HOST/DBNAME?sslmode=require"
alembic upgrade head

# Option B — edit alembic.ini directly
# Replace the sqlalchemy.url line, then:
alembic upgrade head
```

This creates all 6 tables: `users`, `presence`, `challenges`, `games`, `game_rounds`, `player_game_state`.

To roll back:
```bash
alembic downgrade base
```

---

## 4. Google OAuth — Get a Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
2. Click **"+ Create Credentials"** → **OAuth 2.0 Client ID**.
3. Application type: **Web application**.
4. Add your **Authorized JavaScript origins**:
   - `http://localhost:5173` (Vite dev server)
   - `https://Abhinish098.github.io` (GitHub Pages)
5. Click **Create** and copy the **Client ID**.

### Paste it into the frontend:

Open `screwing-around/src/components/Login.jsx` and replace:
```js
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE';
```
with your actual Client ID.

---

## 5. Configure the Frontend API URL

Open `screwing-around/.env.local` (create if it doesn't exist):

```env
VITE_API_URL=http://localhost:4000       # development
VITE_WS_URL=ws://localhost:4000          # development
```

For production (after deploying the server), update to your deployed server URL:
```env
VITE_API_URL=https://your-server.railway.app
VITE_WS_URL=wss://your-server.railway.app
```

---

## 6. Run Locally

**Terminal 1 — Backend server:**
```bash
cd server
npm install
npm run dev
# → Server running on http://localhost:4000
# → WebSocket on ws://localhost:4000
```

**Terminal 2 — Frontend (Vite dev server):**
```bash
cd screwing-around
npm install
npm run dev
# → http://localhost:5173
```

Open http://localhost:5173 in two different browser profiles (or one normal + one incognito) and sign in with two different Google accounts to test the full game loop.

---

## 7. Deploy the Server

GitHub Pages only hosts static files, so the Node.js server needs a separate host. Recommended free-tier options:

### Railway (easiest)
```bash
# Install Railway CLI
npm i -g @railway/cli
railway login
cd server
railway init
railway up
```
Set environment variables in the Railway dashboard → Variables.

### Render
1. Push `server/` to a GitHub repo (or the same repo).
2. New Web Service → connect repo → Build command: `npm install` → Start command: `node index.js`.
3. Add env vars under Environment.

### Fly.io
```bash
cd server
fly launch
fly secrets set DATABASE_URL="..." JWT_SECRET="..."
fly deploy
```

---

## 8. Deploy the Frontend to GitHub Pages

```bash
cd screwing-around

# Make sure VITE_API_URL / VITE_WS_URL are set correctly in .env.local
# (pointing at your deployed server, not localhost)

npm run deploy
```

This runs `vite build` then `gh-pages -d dist`, publishing to the `gh-pages` branch.

> ⚠️ The `base` in `vite.config.js` is already set to `/screwing/` which matches the GitHub Pages URL `https://Abhinish098.github.io/screwing`.

---

## File Map — Credential Placeholders

| File | Placeholder | What to put there |
|------|------------|-------------------|
| `screwing-around/src/components/Login.jsx` | `YOUR_GOOGLE_CLIENT_ID_HERE` | Google OAuth Client ID |
| `server/db.js` | `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require` | Neon.tech connection string |
| `server/.env` (copy from `.env.example`) | `DATABASE_URL`, `JWT_SECRET` | Neon string + random secret |
| `alembic.ini` | `sqlalchemy.url = postgresql+psycopg2://USER:...` | Neon string (with psycopg2 prefix) |

---

## Architecture Overview

```
Browser (GitHub Pages)              Server (Railway/Render/Fly.io)
┌──────────────────────┐            ┌─────────────────────────────┐
│  React + HashRouter  │  REST API  │  Express                    │
│  ├── Login.jsx       │ ◄────────► │  ├── /auth/google           │
│  ├── Lobby.jsx       │            │  ├── /lobby                 │
│  ├── Game.jsx        │            │  ├── /challenge/:id/accept  │
│  └── Result.jsx      │  WebSocket │  └── /game/:id/move         │
│                      │ ◄────────► │  WebSocketServer (ws)       │
└──────────────────────┘            └──────────────┬──────────────┘
                                                   │
                                    ┌──────────────▼──────────────┐
                                    │  Neon.tech (PostgreSQL)      │
                                    │  users, presence, games …    │
                                    └─────────────────────────────┘
```

## Game Rules Quick Reference

| You \ Opponent | Attack | Defend | Run |
|----------------|--------|--------|-----|
| **Attack** | Both −1 HP | You −1 HP | Opp −2 HP |
| **Defend** | Opp −1 HP | Nothing | Nothing |
| **Run** | You −2 HP | Nothing | Nothing |

Starting HP: **10**. First to reach 0 loses.
