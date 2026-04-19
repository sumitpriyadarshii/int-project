# Visual Reference

This document gives a quick visual map of the DataVerse project so new contributors can understand the structure, flow, and responsibilities at a glance.

## High-Level Architecture

```text
User Browser
   |
   v
Frontend (React + Vite)
   |
   v
Backend API (Express)
   |
   +--> MongoDB (data)
   +--> Redis (optional cache)
   +--> Blob Storage (optional uploads)
   `--> Email Provider (OTP/notifications)
```

## Request Flow (Typical)

```text
1. User action in UI (login, search, upload)
2. Frontend calls API via axios client
3. Backend middleware validates/authenticates request
4. Route handler processes business logic
5. DB/cache/storage services are used
6. JSON response returned to frontend
7. UI updates state and renders result
```

## Project Folder Map

```text
.
|-- README.md
|-- Docs/
|   |-- README.md
|   |-- BACKEND_README.md
|   |-- FRONTEND_README.md
|   |-- API_REFERENCE.md
|   |-- DEPLOYMENT_CHECKLIST.md
|   `-- Visual_reference.md
|-- frontend/
|   `-- src/
|       |-- api/client.js
|       |-- context/
|       |-- components/
|       `-- pages/
|-- backend/
|   |-- api/
|   |-- routes/
|   |-- models/
|   |-- middleware/
|   |-- utils/
|   `-- scripts/
`-- api/
```

## Frontend Screen Reference

- `AuthPage`: login/register and access entry.
- `DashboardPage`: dataset discovery and overview.
- `DatasetDetailPage`: dataset metadata, preview, and interaction.
- `UploadPage`: dataset contribution flow.

## Backend Responsibility Reference

- `routes/auth.js`: auth, OAuth, session/profile, password/OTP.
- `routes/datasets.js`: dataset listing, upload, downloads, versions, quality.
- `routes/discussions.js`: discussion threads, replies, votes, moderation flags.
- `routes/admin.js`: admin-only controls and moderation.
- `api/_core.js`: app creation, middleware setup, health, unified/scoped API behavior.

## Environment Variable Visual Groups

```text
Backend Core:    PORT, JWT_SECRET, NODE_ENV
Database:        MONGO_URI or MONGO_* (Atlas)
Origins/CORS:    FRONTEND_URL, CLIENT_URL, CLIENT_URLS
Auth/OAuth:      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL
Cache:           REDIS_URL, CACHE_TTL_SECONDS, DATASET_CACHE_TTL_SECONDS
Storage:         BLOB_READ_WRITE_TOKEN
Email:           EMAIL_USER, EMAIL_PASS, EMAIL_FROM

Frontend Core:   VITE_API_URL, VITE_SOCKET_URL, VITE_ENABLE_REALTIME
```

## Deployment Visual Options

### Option A (Recommended)

```text
Vercel (Frontend)  --->  Render/Railway/VM (Backend)  --->  MongoDB
```

### Option B (Serverless-oriented)

```text
Vercel (Frontend + API handlers)  --->  MongoDB + external services
```

Use [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) before production release.
