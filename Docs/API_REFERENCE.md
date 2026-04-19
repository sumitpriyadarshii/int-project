# API Reference

This document summarizes the main DataVerse backend API groups, common request patterns, and example endpoints.

## Base URL

Local development base URL:

- `http://localhost:5000/api`

Examples in this file assume that base URL.

## Response Pattern

Most endpoints return JSON in a structure similar to:

```json
{
  "success": true,
  "message": "Optional message",
  "data": {}
}
```

Error responses typically include:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Authentication

Protected routes require JWT authentication.

- Token header format:

```http
Authorization: Bearer <token>
```

Primary auth routes:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/google`
- `GET /auth/google/callback`

Password reset / OTP flows are also exposed through the auth route group.

## Health

- `GET /health`
- `GET /api/health`

Returns uptime, timestamp, and database status.

## Datasets

Main dataset endpoints:

- `GET /datasets`
- `GET /datasets/search`
- `GET /datasets/trending`
- `GET /datasets/:id`
- `POST /datasets` (multipart form upload, authenticated)
- `POST /datasets/:id/download`
- `POST /datasets/:id/access-request`
- `PUT /datasets/:id/access-request/:requestId`

Additional dataset features include versions, quality reports, timeline, and issue tracking.

Common query params on listing endpoints:

- `q` (text search)
- `category`
- `topic`
- `tags`
- `license`
- `sort`
- `page`
- `limit`

## Discussions

Main discussion endpoints:

- `GET /discussions/dataset/:datasetId`
- `POST /discussions` (authenticated)
- `PATCH /discussions/:id` (owner/admin)
- `POST /discussions/:id/reply` (authenticated)
- `POST /discussions/:id/vote` (authenticated)
- `POST /discussions/:id/flag` (authenticated)
- `PUT /discussions/:id/status` (owner/contributor/admin)

## Admin

Admin routes are grouped under:

- `/admin`

and API-prefixed under:

- `/api/admin`

These routes require admin authorization and include moderation and platform management operations.

## Rate Limiting and Security Notes

- API-wide and auth/admin-specific rate limits are enforced by middleware.
- Input sanitization and security headers are enabled.
- CORS is origin-validated using configured client URLs.

## Notes for Frontend Integration

- Frontend axios client uses `withCredentials: true`.
- The frontend sends bearer tokens from local storage when available.
- Configure `VITE_API_URL` to point to your API base.
