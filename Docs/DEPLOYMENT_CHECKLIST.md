# Deployment Checklist

Use this checklist before deploying DataVerse Hub to production.

## 1. Pre-Deployment Validation

- [ ] Install dependencies successfully at root, backend, and frontend.
- [ ] Build frontend without errors (`npm --prefix frontend run build`).
- [ ] Backend starts locally with production-like env values.
- [ ] Health endpoint responds successfully (`/health` and `/api/health`).

## 2. Environment Variables

### Backend (required)

- [ ] `JWT_SECRET`
- [ ] `NODE_ENV=production`
- [ ] One DB configuration path:
  - [ ] `MONGO_URI`
  - [ ] or Atlas variables (`MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_CLUSTER`, `MONGO_DB_NAME`)
- [ ] Allowed frontend origins configured (`FRONTEND_URL` and/or `CLIENT_URLS`)

### Backend (optional integrations)

- [ ] Google OAuth variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`)
- [ ] Email variables (`EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`)
- [ ] Cache variables (`REDIS_URL`, `CACHE_TTL_SECONDS`, `DATASET_CACHE_TTL_SECONDS`)
- [ ] Blob storage (`BLOB_READ_WRITE_TOKEN`) if upload storage uses Vercel Blob

### Frontend

- [ ] `VITE_API_URL`
- [ ] `VITE_SOCKET_URL`
- [ ] `VITE_ENABLE_REALTIME`

## 3. CORS and Auth Validation

- [ ] Frontend origin is included in backend allowed origins.
- [ ] Login, logout, and session-check (`/auth/me`) work in deployed environment.
- [ ] Protected API routes reject unauthenticated calls and accept authenticated calls.

## 4. Database and Data Safety

- [ ] Database connectivity verified from deployed backend.
- [ ] Required indexes/migrations completed.
- [ ] Backups/snapshots strategy is in place.
- [ ] Test data is removed or isolated from production.

## 5. File Uploads and Storage

- [ ] Dataset upload flow tested end to end.
- [ ] Download URLs resolve correctly in deployed environment.
- [ ] Storage token/permissions validated.

## 6. Security Controls

- [ ] Rate limiting is enabled and tested.
- [ ] Strong `JWT_SECRET` configured.
- [ ] HTTPS enforced by host/platform.
- [ ] No secrets committed in repository.

## 7. Deployment Target Checklist

### Split Hosting (recommended)

- [ ] Frontend deployed to Vercel (`frontend` root).
- [ ] Backend deployed to long-running Node host (Render/Railway/VM).
- [ ] Frontend env points to backend URL.

### Serverless Option

- [ ] Vercel handlers configured (`backend/api/*`, `api/index.js` bridge).
- [ ] All backend env vars set in Vercel project.
- [ ] Upload/email flows tested in serverless lifecycle.

## 8. Post-Deployment Smoke Tests

- [ ] Home/dashboard pages load.
- [ ] Registration and login succeed.
- [ ] Dataset list/search/detail endpoints work.
- [ ] Discussion create/reply/vote works.
- [ ] Health endpoint reports healthy DB state.

## 9. Monitoring and Operations

- [ ] Log collection is enabled.
- [ ] Error alerting is configured.
- [ ] Basic uptime monitor is set for `/api/health`.
- [ ] Rollback procedure is documented.
