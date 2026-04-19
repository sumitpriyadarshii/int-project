# DataVerse Frontend

React + Vite frontend for DataVerse Hub. This client handles authentication, dataset browsing, detail/preview views, uploads, and discussions.

## Features

- Auth flows (register/login/logout/session retrieval).
- Dataset listing, search, detail pages, and contributor-facing upload flow.
- Discussion UI integration via backend APIs.
- API client normalization for users, datasets, and discussion payloads.
- Interactive visuals using Framer Motion and Three.js.

## Directory Overview

```text
frontend/
|-- src/
|   |-- api/client.js            # Axios instance and API wrappers
|   |-- context/AuthContext.jsx  # Auth/session state
|   |-- components/              # Reusable UI components
|   `-- pages/                   # Route-level pages
|-- public/
|-- index.html
|-- vite.config.js
`-- package.json
```

## Prerequisites

- Node.js >= 20
- npm >= 9
- Running backend API (local or deployed)

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Configure values:

- `VITE_API_URL` (example local: `http://localhost:5000/api`)
- `VITE_SOCKET_URL` (example local: `http://localhost:5000`)
- `VITE_ENABLE_REALTIME` (`true` or `false`)

If `VITE_API_URL` is not set, the frontend falls back to `/api`.

## Install

```bash
cd frontend
npm install
```

## Run

Development:

```bash
cd frontend
npm run dev
```

Build:

```bash
cd frontend
npm run build
```

Preview production build:

```bash
cd frontend
npm run preview
```

## Scripts

- `npm run dev` - start Vite dev server
- `npm run build` - production build
- `npm run build:prod` - explicit production mode build
- `npm run preview` - preview built assets
- `npm run preview:prod` - preview with host/port flags
- `npm run lint` - run ESLint checks

## API Integration

- Axios base URL comes from `VITE_API_URL` in `src/api/client.js`.
- Requests include `withCredentials: true` and attach a Bearer token from local storage when available.
- API wrappers expose grouped operations:
  - `authAPI`
  - `datasetAPI`
  - `discussionAPI`

## Deployment Notes

- Deploy this frontend folder directly to Vercel for best DX.
- Set environment variables in Vercel project settings (`VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_ENABLE_REALTIME`).
- Ensure backend CORS settings allow this frontend origin.

## Troubleshooting

- 404/failed API calls: verify `VITE_API_URL` and backend availability.
- CORS errors: confirm frontend domain is present in backend allowed origins.
- Auth session issues: verify backend cookie/auth configuration and matching API URL.
