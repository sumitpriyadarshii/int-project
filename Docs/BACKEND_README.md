# DataVerse Backend

Node.js + Express backend for DataVerse Hub, including authentication, dataset management, discussions, admin operations, and deployment-ready serverless handlers.

## Features

- JWT authentication and optional Google OAuth.
- Dataset CRUD, uploads, access requests, versioning, and quality checks.
- Discussion threads with replies, votes, flags, and moderation hooks.
- Configurable rate limiting and input sanitization.
- Optional Redis cache and optional Vercel Blob file storage.
- Local dev runtime and serverless API handler compatibility.

## Directory Overview

```text
backend/
|-- api/             # Serverless handlers + core app factory
|-- routes/          # Express route modules
|-- models/          # Mongoose schemas
|-- middleware/      # Auth, validation, security
|-- utils/           # DB/cache/blob/mailer/security helpers
|-- scripts/         # Seed and maintenance scripts
|-- dev-server.js    # Local runtime entrypoint
|-- server.js        # Unified app export
`-- package.json
```

## Prerequisites

- Node.js >= 20
- npm >= 9
- MongoDB Atlas credentials or local Mongo URI (optional due to in-memory fallback for local dev)

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Fill minimum required values:

- `JWT_SECRET`
- `PORT` (optional, default `5000`)
- One database option:
  - `MONGO_URI`
  - or `MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_CLUSTER`, `MONGO_DB_NAME`
- Client origin config: `FRONTEND_URL` and/or `CLIENT_URLS`

Optional integrations:

- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Email OTP: `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`
- Cache: `REDIS_URL`, `CACHE_TTL_SECONDS`, `DATASET_CACHE_TTL_SECONDS`
- Blob storage: `BLOB_READ_WRITE_TOKEN`
- Security/rate limit tuning: `API_RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `ADMIN_RATE_LIMIT_*`, etc.

## Install

```bash
cd backend
npm install
```

## Run

Development:

```bash
cd backend
npm run dev
```

Production-like local run:

```bash
cd backend
npm start
```

PowerShell production mode helper:

```bash
cd backend
npm run start:prod
```

## Scripts

- `npm run dev` - start with nodemon (`dev-server.js`)
- `npm start` - start with node (`dev-server.js`)
- `npm run start:prod` - set `NODE_ENV=production` and run backend
- `npm run seed:datasets` - seed dataset records
- `npm run reset:downloads` - reset download counters
- `npm run clean` - release common local ports (5000/5173)
- `npm run clean-dev` - clean ports then restart dev
- `npm test` - placeholder test command

## API Base and Health

Base URL (local): `http://localhost:5000/api`

Health endpoints:

- `GET /health`
- `GET /api/health`

## Route Groups

- `/api/auth` and `/auth`
- `/api/datasets` and `/datasets`
- `/api/discussions` and `/discussions`
- `/api/admin` and `/admin`

## Deployment Notes

- Long-running Node deployment (Render/Railway/VM) is recommended for upload and realtime-heavy behavior.
- Serverless deployment is supported using `backend/api/*` handlers.
- For Vercel Blob uploads, set `BLOB_READ_WRITE_TOKEN`.
- Ensure frontend origin variables (`FRONTEND_URL`, `CLIENT_URLS`) are correct to avoid CORS issues.

## Troubleshooting

- Port in use: run `npm run clean` then `npm run dev`.
- DB connection issues: verify Mongo credentials/URI and network allowlist.
- OAuth redirect problems: validate callback URL and frontend URL variables.
