# Intentify

Turn your screen and voice (or typed requests) into high-quality AI prompts. Capture what you’re doing, describe it in words, and generate short, detailed, and expert-level prompts for any AI workflow.

---

## Features

- **Sessions** — Start a session, capture or type your request, then generate prompts.
- **Capture** — Record **audio + screen** together. Get a live preview of what’s being captured and a floating **Stop** window so you can end recording without returning to the tab.
- **Type or speak** — Use the **“Your request”** text area to type your request, or record via capture. You can also edit the transcript after recording.
- **Screen analysis** — Screenshots are analyzed with **Gemini Vision** (summaries, UI, errors). You can also upload an image.
- **Prompt generation** — From your request (and optional screen summary), the app extracts intent and produces **short**, **detailed**, and **expert** prompt variants.

---

## Tech Stack

| Layer    | Stack |
|----------|--------|
| **Frontend** | Next.js 14, React, TypeScript, Tailwind CSS |
| **Backend**  | FastAPI, Python 3.11, Uvicorn |
| **Database** | PostgreSQL 16 |
| **AI / ML**  | Google Cloud Speech-to-Text, Vertex AI Gemini (`gemini-2.5-flash-lite`) via REST + API key |

---

## Prerequisites

- **Docker** and **Docker Compose** (v2 `docker compose` or v1 `docker-compose`)
- **Google Cloud** project with:
  - [Vertex AI API](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com) enabled
  - [Speech-to-Text API](https://console.cloud.google.com/apis/library/speech.googleapis.com) enabled
- **API key** for Vertex AI (or Gemini), and optionally a **service account** for Speech-to-Text  
  (see [Environment variables](#environment-variables)).

---

## Quick Start (Docker)

1. **Clone and go to the project root**
   ```bash
   cd Intentify
   ```

2. **Configure backend env**
   - Copy `backend/.env.example` to `backend/.env` and fill in your values.
   - Set at least: `GOOGLE_PROJECT_ID`, `GOOGLE_LOCATION`, `VERTEX_AI_API_KEY`.  
   - Add [service account](#environment-variables) vars if you use **audio capture**.

3. **Build and run with Docker**
   ```bash
   make build && make up
   ```
   Or without Make: `docker compose build && docker compose up -d`

4. **Open the app**
   - **Frontend:** http://localhost:3000  
   - **API:** http://localhost:8003  
   - **Health:** http://localhost:8003/health

---

## Makefile (Docker)

All targets use **Docker Compose**:

```bash
make build          # Build images
make up             # Start all services (detached)
make dev            # Dev mode: hot-reload for backend + frontend
make prod           # Production: no source mounts, ENVIRONMENT=production
make down           # Stop services
make logs           # Follow all logs
make logs-backend   # Backend logs only
make logs-frontend  # Frontend logs only
make restart-backend
make db-shell       # PostgreSQL psql (intentify / intentify_db)
make clean          # Stop and remove volumes
make rebuild        # Rebuild and restart
```

---

## Environment Variables

### Backend (`backend/.env`)

Loaded by the FastAPI app and by Docker when using `env_file: ./backend/.env`.

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_PROJECT_ID` | Yes | GCP project ID (e.g. `intentify-prod-485508`) |
| `GOOGLE_LOCATION` | Yes | Vertex AI region (e.g. `us-central1`) |
| `VERTEX_AI_API_KEY` | Yes* | API key for Vertex / Gemini. Used for vision, intent, and prompt generation. |
| `GOOGLE_API_KEY` | No | Fallback if `VERTEX_AI_API_KEY` is not set |
| `DATABASE_URL` | No (Docker) | PostgreSQL URL. Default below. Docker overrides with `postgres` host. |
| `ENVIRONMENT` | No | `development` (default) or `production` |
| `SQL_ECHO` | No | Log SQL queries. Set `true` for debugging. Default: `false` |
| `CORS_ORIGINS` | No | Comma-separated origins. Default: `http://localhost:3000` |

**Service account (for Speech-to-Text):**

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_TYPE` | Yes** | `service_account` |
| `GOOGLE_SERVICE_ACCOUNT_PROJECT_ID` | Yes** | GCP project ID |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID` | Yes** | Private key ID from JSON key |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Yes** | Private key (multiline OK; `\n` supported) |
| `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL` | Yes** | Service account email |
| `GOOGLE_SERVICE_ACCOUNT_CLIENT_ID` | No | Client ID |
| `GOOGLE_SERVICE_ACCOUNT_AUTH_URI` | No | Default: `https://accounts.google.com/o/oauth2/auth` |
| `GOOGLE_SERVICE_ACCOUNT_TOKEN_URI` | No | Default: `https://oauth2.googleapis.com/token` |
| … (other optional cert URLs) | No | As in a typical GCP service account JSON |

\* Required for intent extraction, prompt generation, and vision.  
\** Required if you use **audio capture** (Speech-to-Text). Typed-only or image-only flows can rely on the API key alone.

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | No | Backend base URL. Default: `http://localhost:8003` |

Set in `docker-compose` / `docker-compose.dev` or in `.env.local` for local Next.js.

### Docker Compose (optional overrides)

Use a project-root `.env` or `backend/.env` to override:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `intentify` | Postgres user |
| `POSTGRES_PASSWORD` | `intentify123` | Postgres password |
| `POSTGRES_DB` | `intentify_db` | Postgres database |
| `POSTGRES_PORT` | `5432` | Host port for Postgres |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8003` | Backend URL for frontend |

**Production override:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` (or `make prod`) runs without source mounts and sets `ENVIRONMENT=production`, `SQL_ECHO=false`.

### Database (default when not in Docker)

- **URL:** `postgresql+asyncpg://intentify:intentify123@localhost:5432/intentify_db`
- **User:** `intentify`  
- **Password:** `intentify123`  
- **DB:** `intentify_db`

---

## Project Structure

```
Intentify/
├── backend/                 # FastAPI app
│   ├── app/
│   │   ├── config.py        # Env, Google config
│   │   ├── database.py      # PostgreSQL + SQLAlchemy
│   │   ├── main.py          # App, CORS, routers
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── routers/         # sessions, prompts, health
│   │   └── services/        # speech, vision, intent, prompt, gemini_rest
│   ├── requirements.txt
│   ├── run.py
│   ├── .env.example
│   └── Dockerfile
├── frontend/                # Next.js app
│   ├── app/
│   │   ├── page.tsx         # Home, “Start New Session”
│   │   ├── session/[id]/    # Session page (capture, request, generate)
│   │   └── layout.tsx, globals.css
│   ├── components/
│   │   ├── UnifiedCapture.tsx   # Audio + screen capture, floating stop, preview
│   │   └── PromptOutput.tsx     # Rendered prompts
│   ├── package.json
│   ├── next.config.js
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── Makefile
└── README.md
```

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Simple API hello |
| `GET` | `/health` | Health check |
| `POST` | `/session/start` | Create session, returns `{ id, ... }` |
| `GET` | `/session/{id}` | Get session by ID |
| `POST` | `/session/{id}/capture` | Upload `audio` and/or `screen` (multipart). Returns `transcript`, `screen_summary`. |
| `POST` | `/session/{id}/audio` | Upload audio only (legacy) |
| `POST` | `/session/{id}/screen` | Upload screenshot only (legacy) |
| `POST` | `/prompts/{id}/generate` | Generate prompts. Optional body: `{ "transcript": "...", "screen_summary": "..." }` to override session stored values. |
| `GET` | `/health/models` | Check Gemini REST (`gemini-2.5-flash-lite`) availability via API key |

---

## Local Development (without Docker)

**Optional.** Use this only if you prefer not to run via Docker.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or `.venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

Create `backend/.env` with the variables above. Ensure PostgreSQL is running and `DATABASE_URL` points to it.

```bash
python run.py
# or, with reload: RELOAD=true python run.py
```

Runs at **http://localhost:8003** by default.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at **http://localhost:3000**. Set `NEXT_PUBLIC_API_URL` if the API is not on `http://localhost:8003`.

### Database

Use the default DB config, or run PostgreSQL via Docker:

```bash
docker run -d --name intentify-postgres \
  -e POSTGRES_USER=intentify \
  -e POSTGRES_PASSWORD=intentify123 \
  -e POSTGRES_DB=intentify_db \
  -p 5432:5432 \
  postgres:16
```

---

## User Flow

1. **Home** → Click **“Start New Session”** → redirected to `/session/{id}`.
2. **Your request** — Type in the text area and/or use **Capture**.
3. **Capture** — **Start Capture** → pick screen/window → record audio + screen. Use the **floating Stop** window or the **Stop Capture** button. Uploaded image is an alternative.
4. **Transcript** — Filled from Speech-to-Text, or type manually. Editable anytime.
5. **Generate** — Click **Generate** to run intent extraction + prompt generation. Uses current transcript (and screen summary when available).
6. **Prompts** — View short, detailed, and expert prompts.

---

## AI Services

- **Vision** — Gemini REST (`gemini-2.5-flash-lite`) + API key. Screenshots analyzed via `inlineData` + generateContent.
- **Intent & prompts** — Same model via `app/services/gemini_rest` (text-only).
- **Speech-to-Text** — Google Cloud Speech-to-Text; requires service account credentials.

Model and region are configured via `GOOGLE_PROJECT_ID`, `GOOGLE_LOCATION`, and `VERTEX_AI_API_KEY`.

---

## Troubleshooting

### “Vision analysis error” / “Intent extraction error” / “Prompt generation failed”

- Ensure `VERTEX_AI_API_KEY` (or `GOOGLE_API_KEY`) is set in `backend/.env`.
- Confirm Vertex AI (and optionally Generative Language) APIs are enabled and the key has access.
- Check backend logs: `docker compose logs -f backend` or `make logs-backend`.

### “Session needs transcript or screen summary”

- Add text in **“Your request”** and/or complete a **capture** (audio + screen or at least screen).
- Generate uses the current text area value and any screen summary from the last capture.

### “Failed to start capture” / “Please check permissions”

- Grant **microphone** and **screen/window** sharing when the browser asks.
- Use HTTPS (or `localhost`) for `getUserMedia` / `getDisplayMedia`.

### Popup blocked for “Stop capture”

- Allow popups for the app’s origin. You can still use **Stop Capture** on the page.

### Database connection errors

- With Docker: use `DATABASE_URL` with host `postgres` and port `5432`.
- Ensure the Postgres container is healthy: `docker compose ps` and `docker compose logs postgres`.

### Ports in use

- Change frontend/backend/Postgres ports in `docker-compose.yml` if 3000, 8003, or 5432 are taken.

---

## Security / Pushing to GitHub

- **Never commit** `backend/.env`, `backend/service-account-key.json`, or any file containing API keys, private keys, or passwords.
- `.gitignore` excludes `.env`, `**/service-account*.json`, `**/*-key.json`, and `apis`. Keep them that way.
- Use `backend/.env.example` as a template only; it has no real secrets.
- For CI/CD or production, inject secrets via env vars or a secret manager, not files in the repo.

## Production Notes

- Run **without** dev overrides; use production Dockerfiles.
- Use strong DB credentials and a managed PostgreSQL instance when possible.
- Store secrets in a vault or your platform’s secret manager; avoid committing `.env`.
- Put the app behind a reverse proxy (e.g. nginx) and enable HTTPS.
- Restrict CORS `allow_origins` in `backend/app/main.py` to your frontend origin(s).

---

## License

Proprietary. All rights reserved.
