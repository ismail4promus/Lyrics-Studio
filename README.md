# Lyrics Studio Backend

A small Express + MongoDB (Mongoose) API for storing song lyrics.

## Requirements

- Node.js >= 16
- A MongoDB instance (local or hosted)

## Setup

```bash
npm install
cp .env.example .env   # then fill in MONGO_URI (and ALLOWED_ORIGINS if needed)
```

## Running

```bash
npm start   # node server.js
npm run dev # nodemon server.js, restarts on file changes
```

The server fails fast and exits (code 1) if it can't connect to MongoDB on startup, so a process
manager (pm2, systemd, Docker restart policy, ...) can restart it once the database is reachable.

## Environment variables

| Variable          | Required | Default | Description |
|--------------------|:--------:|---------|--------------|
| `MONGO_URI`         | yes | — | MongoDB connection string |
| `PORT`              | no  | `3000` | HTTP port to listen on |
| `ALLOWED_ORIGINS`   | no  | *(none)* | Comma-separated list of origins allowed to make cross-origin browser requests. Server-to-server requests (no `Origin` header) are always allowed. Leave unset to block all cross-origin browser requests. |

## API

All responses are JSON. Errors are always `{ "error": "..." }` (with an optional `fields` object
for validation errors) — never an HTML page or a stack trace.

### `GET /health`

Reports whether the database connection is up.

```json
{ "status": "ok", "db": "connected" }
```
Returns `503` with `"status": "degraded"` when the database isn't connected.

### `GET /lyrics`

Paginated list of lyrics, newest first.

Query params: `page` (default `1`), `limit` (default `50`, max `100`).

```json
{ "data": [ /* lyric documents */ ], "page": 1, "limit": 50, "total": 3, "totalPages": 1 }
```

### `POST /lyrics`

Creates a lyric. Body:

```json
{ "title": "string, required", "artist": "string, required", "lyrics": "string, required" }
```

- Only `title`, `artist`, and `lyrics` are ever read from the request body — no other field
  (including `_id`) can be set by the caller.
- `title`/`artist` pairs must be unique; a duplicate returns `409`.
- Rate-limited to 20 requests per 15 minutes per client.

Both `/lyrics` routes return `503` immediately (instead of hanging) when the database isn't
connected.

## Testing

```bash
npm test
```

Tests run against the exported Express app directly (`app.js`, no live database needed) —
they cover the error-handling middleware, the JSON 404 handler, the database-unavailable `503`
guard, and schema validation.

## Project structure

- `app.js` — Express app: middleware, routes, error handling. Exports the app; does not connect
  to MongoDB or call `listen()`, so it can be imported by tests without binding a port.
- `server.js` — the actual entrypoint: loads environment variables, connects to MongoDB
  (fail-fast), starts the HTTP server, and handles graceful shutdown / process-level errors.
