# 🐒 Kahani

A self-hosted web app for learning Hindi through AI-generated stories and exercises, built around the concept of **comprehensible input (Krashen's i+1)**. The system tracks your vocabulary and grammar knowledge, then uses Claude to generate personalized short stories that are mostly understandable but introduce a few new elements each session.

## Screenshots

<img width="1267" height="789" alt="image" src="https://github.com/user-attachments/assets/0742e20d-2a8f-4036-9893-ad9fc3927414" />
<img width="998" height="779" alt="image" src="https://github.com/user-attachments/assets/e0bdd25b-efea-4f76-b104-3c2f3da9df4a" />


## Why?

Traditional flashcard apps drill isolated words. Immersion content is overwhelming for beginners. Kahani sits in the gap — every piece of content is personalized to be just at the edge of your ability, with full context.

## Tech Stack

| Layer      | Technology                               |
| ---------- | ---------------------------------------- |
| Frontend   | React 19, Vite, TypeScript, Tailwind CSS |
| Backend    | Hono (Node.js), TypeScript               |
| Database   | PostgreSQL + Drizzle ORM                 |
| Auth       | better-auth (session-based)              |
| AI         | Claude API (Anthropic)                   |
| TTS        | Google Cloud Text-to-Speech              |
| Storage    | MinIO (S3-compatible)                    |
| Monorepo   | pnpm workspaces                          |
| Deployment | Docker Compose                           |

## Features

- 📖 **AI-generated stories** — personalized Hindi stories at your level
- 🧠 **Spaced repetition** — SM-2 based review scheduling
- 📝 **Exercises** — comprehension, fill-in-the-blank, translation, word ordering
- 🗣️ **Text-to-Speech** — hear Hindi words and sentences pronounced correctly
- 📊 **Progress tracking** — vocabulary and grammar mastery dashboard
- 👤 **Multi-user support** — each user has isolated progress
- 🔤 **Dictionary** — browse and search the Hindi word database

## Project Structure

```
kahani/
├── apps/
│   ├── api/              # Hono backend API
│   │   ├── src/
│   │   │   ├── db/       # Database schema, migrations, seeds
│   │   │   ├── lib/      # Middleware, prompts, storage, TTS
│   │   │   └── routes/   # REST API endpoints
│   │   └── drizzle/      # SQL migration files
│   └── web/              # React frontend SPA
│       └── src/
│           ├── components/  # UI components and views
│           ├── hooks/       # Custom React hooks
│           └── lib/         # API client and utilities
├── packages/
│   └── shared/           # Shared types and utilities
├── docker-compose.dev.yml
└── docker-compose.prod.yml
```

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 22
- [pnpm](https://pnpm.io/) ≥ 9
- [Docker](https://www.docker.com/) & Docker Compose
- An [Anthropic API key](https://console.anthropic.com/) (for Claude)
- (Optional) A [Google Cloud service account](https://cloud.google.com/text-to-speech) for Hindi TTS

## Getting Started

### 1. Clone & install dependencies

```bash
git clone https://github.com/asoderlind/kahani.git
cd kahani
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

| Variable                         | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `DATABASE_URL`                   | PostgreSQL connection string                |
| `API_SECRET_KEY`                 | Secret key for session signing              |
| `ANTHROPIC_API_KEY`              | Your Claude API key                         |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account JSON (optional) |

### 3. Start with Docker (recommended)

**Development:**

```bash
docker compose -f docker-compose.dev.yml up --build
```

This starts PostgreSQL, MinIO, and the API + web app with hot-reloading.

**Production:**

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### 4. Run database migrations & seed data

```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Start without Docker (manual)

Make sure PostgreSQL and MinIO are running, then:

```bash
pnpm dev
```

- **Frontend:** http://localhost:5173
- **API:** http://localhost:8000
- **API Health:** http://localhost:8000/api/health

## API Endpoints

| Method   | Endpoint          | Description                  |
| -------- | ----------------- | ---------------------------- |
| GET      | `/api/health`     | Health check                 |
| ALL      | `/api/auth/*`     | Authentication (better-auth) |
| GET/POST | `/api/words`      | Vocabulary management        |
| GET/POST | `/api/grammar`    | Grammar concepts             |
| GET/POST | `/api/stories`    | AI-generated story sessions  |
| GET/POST | `/api/exercises`  | Practice exercises           |
| GET/POST | `/api/reviews`    | Spaced repetition reviews    |
| GET      | `/api/users`      | User profile & progress      |
| GET      | `/api/characters` | Story characters             |
| POST     | `/api/tts`        | Text-to-Speech generation    |
| GET      | `/api/dictionary` | Dictionary search            |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed system architecture and design patterns
- [VISION.md](VISION.md) — Full product vision and data model specification

## License

This project is for personal/educational use.
