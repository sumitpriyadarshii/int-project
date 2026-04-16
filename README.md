# DataVerse Hub

Full-stack dataset collaboration platform with a polished React frontend and a realtime Node.js backend.

## What it does

- Users can register, log in, and keep a persistent session with remember-me support.
- Contributors can upload CSV or JSON datasets with metadata about collection and usage.
- Other users can search by topic, preview sample rows, request access, and download datasets.
- Downloads are tracked and contributor credits are aggregated into a leaderboard.
- Discussion threads let users rate data quality and suggest improvements in realtime.

## Project Structure

- `frontend` - React app with Framer Motion and React Three Fiber visuals
- `backend` - Express API, Socket.IO realtime events, and MongoDB/Mongoose persistence

## Backend Setup

1. Open `backend/.env.example` and copy it to `backend/.env`.
2. Fill in either `MONGO_URI` for a local MongoDB instance or the Atlas variables:
   - `MONGO_USERNAME`
   - `MONGO_PASSWORD`
   - `MONGO_CLUSTER`
   - `MONGO_DB_NAME`
3. (Optional) Enable Google OAuth by setting:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_CALLBACK_URL` (for local dev: `http://localhost:5000/api/auth/google/callback`)
4. Start the backend:

```bash
cd backend
npm install
npm run dev
```

## Frontend Setup

1. Copy `frontend/.env.example` to `frontend/.env`.
2. Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

## API Summary

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- Datasets: list, create, preview, download, access requests, credits leaderboard
- Discussions: realtime comments and quality suggestions by dataset

## Notes

- Uploaded files are saved in `backend/uploads`.
- The backend automatically builds an Atlas connection string from the Atlas env fields when `MONGO_URI` is not set.
- If neither `MONGO_URI` nor Atlas fields are provided, the backend falls back to an in-memory MongoDB for local development.
- For security, passwords are not stored in the browser; the app remembers the login session and the last email used for sign-in.

## Run Both Apps In One Terminal

From project root:

```bash
npm install
npm run dev
```

## Deployment (Recommended)

This project works best with split hosting:

- Frontend: Vercel (`frontend`)
- Backend: Render/Railway/VM (`backend`)

Reason: the backend uses Socket.IO realtime connections and file uploads, which are not a great fit for Vercel serverless runtime.

### Frontend on Vercel

1. Import this GitHub repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Set environment variables in Vercel:
   - `VITE_API_URL=https://<your-backend-domain>/api`
   - `VITE_SOCKET_URL=https://<your-backend-domain>`
4. Deploy.

### Backend on Render/Railway

1. Deploy the `backend` folder as a Node service.
2. Set environment variables from `backend/.env.example`.
3. Ensure `CLIENT_URL` / `CLIENT_URLS` includes your Vercel frontend domain.
