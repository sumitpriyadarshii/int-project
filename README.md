# DataVerse Hub

DataVerse Hub is a full-stack data collaboration platform for publishing, discovering, and discussing datasets.

This is the main project documentation file. Detailed technical docs are available in the `Docs` folder.

## Team Members

- Sumit Priyadarshi (12402145)
- Monu Kumar (12408795)
- Jwitesh sharma (12401559)

## Important Note

If you need deeper details beyond this main README, open the files in `Docs/`.
This README gives the full project overview, and `Docs/` gives module-level depth.

## Documentation Map

- `Docs/README.md` - docs index and reading order
- `Docs/BACKEND_README.md` - backend setup, scripts, and architecture notes
- `Docs/FRONTEND_README.md` - frontend setup and client integration notes
- `Docs/Team_module.md` - combined role-specific backend, UI, and database module document
- `Docs/Team_module.pdf` - final two-role module submission PDF with image
- `Docs/API_REFERENCE.md` - route group and endpoint reference
- `Docs/DEPLOYMENT_CHECKLIST.md` - release and production readiness checklist
- `Docs/Visual_reference.md` - visual architecture and folder reference

## Read This, Then Go Deeper

- Start here in `README.md` for complete project understanding.
- If you want backend-only details, go to `Docs/BACKEND_README.md`.
- If you want frontend-only details, go to `Docs/FRONTEND_README.md`.
- If you need role-wise module scope, go to `Docs/Team_module.md`.
- If you need complete two-role module submission, go to `Docs/Team_module.pdf`.
- If you want endpoint details, go to `Docs/API_REFERENCE.md`.
- If you are deploying, follow `Docs/DEPLOYMENT_CHECKLIST.md`.
- If you want architecture visuals, open `Docs/Visual_reference.md`.


## What The Project Does

- User authentication with JWT and optional Google OAuth.
- Dataset upload, metadata management, preview, search, and download.
- Discussion and feedback workflows for data quality and collaboration.
- Admin-friendly moderation and operational controls.
- Deployment options for both split hosting and serverless routing.

## Core User Workflows

- Sign up or log in to access protected features.
- Browse datasets from dashboard and search/filter by relevance.
- Open dataset details to preview data and request access/download.
- Upload datasets with metadata for contributors and research use.
- Create discussions and replies to improve quality and collaboration.

## Tech Stack

- Frontend: React, Vite, Axios, React Router, Framer Motion, Three.js
- Backend: Node.js, Express, Mongoose, Passport, Multer
- Data and platform services: MongoDB, Redis (optional), Vercel Blob (optional), Nodemailer

## Repository Layout

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
|-- frontend/              # React client app
|-- backend/               # Express API + serverless handlers
|-- api/                   # Root Vercel API bridge
`-- vercel.json
```

## Service Architecture

- Frontend (`frontend/`) communicates with backend via API requests.
- Backend (`backend/`) handles auth, datasets, discussions, and admin logic.
- Database persistence is handled via MongoDB models.
- Optional Redis improves response speed for cached routes.
- Optional blob storage supports deployed file upload/download handling.

## Quick Start

### 1) Install dependencies

From project root:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

### 2) Configure environment files

- Copy `backend/.env.example` to `backend/.env`
- Copy `frontend/.env.example` to `frontend/.env`

Minimal values to set first:

- Backend: `JWT_SECRET`, Mongo connection (`MONGO_URI` or Atlas envs), `FRONTEND_URL`/`CLIENT_URLS`
- Frontend: `VITE_API_URL`, `VITE_SOCKET_URL`

### 3) Run both services

```bash
npm run dev
```

This starts:

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`

### 4) Validate service health

- `GET http://localhost:5000/health`
- `GET http://localhost:5000/api/health`

## Development Scripts

From root:

- `npm run dev` - run backend + frontend together
- `npm run dev:backend` - run backend only
- `npm run dev:frontend` - run frontend only

Detailed module scripts are documented in:

- `Docs/BACKEND_README.md`
- `Docs/FRONTEND_README.md`

Common backend utility scripts include seeding datasets and resetting download counters.
See exact usage in `Docs/BACKEND_README.md`.

## API Summary

Base API URL in local development: `http://localhost:5000/api`

Main route groups:

- `/auth`
- `/datasets`
- `/discussions`
- `/admin`
- `/health`

See `Docs/API_REFERENCE.md` for endpoint-level guidance.

For frontend integration behavior (token handling, axios setup), see `Docs/FRONTEND_README.md`.

## Environment Variables (Overview)

Backend commonly required variables:

- `JWT_SECRET`
- `NODE_ENV`
- `PORT`
- `MONGO_URI` or Atlas variables (`MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_CLUSTER`, `MONGO_DB_NAME`)
- `FRONTEND_URL` / `CLIENT_URLS`

Frontend variables:

- `VITE_API_URL`
- `VITE_SOCKET_URL`
- `VITE_ENABLE_REALTIME`

Optional backend features:

- Redis caching via `REDIS_URL`
- Blob storage via `BLOB_READ_WRITE_TOKEN`
- PII filtering via `PII_GUARD_ENABLED`
- OAuth via Google client variables

## Deployment Summary

Recommended deployment pattern:

- Frontend on Vercel (`frontend`)
- Backend on a long-running Node host (Render, Railway, VM)

Serverless handlers are also available in `backend/api/*` and bridged from `api/index.js`.

Use `Docs/DEPLOYMENT_CHECKLIST.md` before every production release.

For deployment architecture visuals, see `Docs/Visual_reference.md`.

## Testing Status

- Frontend includes lint/build scripts for verification.
- Backend `npm test` is currently a placeholder (`No tests configured yet`).
- For release quality, combine build checks with health/API smoke checks from the deployment checklist.

## Detailed Docs Reference (Quick Access)

- Project docs index: `Docs/README.md`
- Backend deep dive: `Docs/BACKEND_README.md`
- Frontend deep dive: `Docs/FRONTEND_README.md`
- Team module (role-wise): `Docs/Team_module.md`
- Combined module PDF: `Docs/Team_module.pdf`
- API details: `Docs/API_REFERENCE.md`
- Deployment steps: `Docs/DEPLOYMENT_CHECKLIST.md`
- Visual architecture: `Docs/Visual_reference.md`

## Notes

- Keep `README.md` as the project-level main guide.
- Keep detailed module docs inside `Docs/` for cleaner structure and easier onboarding.
