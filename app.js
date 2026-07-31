const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Security / hygiene middleware ──────────────────────────────────────────
app.disable('x-powered-by');
app.use(helmet());

// CORS is restrictive by default: only origins listed in ALLOWED_ORIGINS (comma-separated) are
// allowed. Requests with no Origin header (curl, server-to-server, same-origin) are always let
// through — only cross-origin browser requests are checked. See .env.example.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  })
);

app.use(express.json());

// Baseline rate limiting for every route, plus a tighter limit on the write endpoint.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again later.' },
});
app.use(generalLimiter);

// ── Lyrics schema and model ─────────────────────────────────────────────────
const LyricsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    artist: { type: String, required: true, trim: true, maxlength: 300 },
    lyrics: { type: String, required: true, trim: true, maxlength: 20000 },
  },
  // Explicit collection name: renaming the model from the original `Lyrics` to the singular
  // `Lyric` (conventional Mongoose naming) would otherwise risk Mongoose re-deriving a different
  // collection name via its own pluralization — pinning it keeps existing data reachable.
  { timestamps: true, collection: 'lyrics' }
);
LyricsSchema.index({ title: 1, artist: 1 }, { unique: true });

const Lyric = mongoose.model('Lyric', LyricsSchema);

// Blocks a request before Mongoose's connection buffering can hold it for the full
// bufferTimeoutMS (10s default) — an outage is reported immediately as a 503, not as a slow
// client-side failure.
function requireDbReady(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database unavailable. Please try again shortly.' });
  }
  next();
}

const READY_STATE_LABELS = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

app.get('/health', (req, res) => {
  const state = mongoose.connection.readyState;
  const healthy = state === 1;
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', db: READY_STATE_LABELS[state] || 'unknown' });
});

app.post('/lyrics', writeLimiter, requireDbReady, async (req, res) => {
  try {
    // Only ever read the three known fields — never spread the raw body, so a caller can't
    // set `_id` (or any other internal field) themselves.
    const { title, artist, lyrics } = req.body || {};
    const savedLyric = await new Lyric({ title, artist, lyrics }).save();
    res.status(201).json(savedLyric);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const fields = Object.fromEntries(Object.entries(err.errors).map(([field, e]) => [field, e.message]));
      return res.status(400).json({ error: 'Validation failed', fields });
    }
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A lyric with this title and artist already exists.' });
    }
    console.error('Error adding lyric:', err);
    res.status(500).json({ error: 'Failed to add lyrics' });
  }
});

app.get('/lyrics', requireDbReady, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Lyric.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Lyric.countDocuments(),
    ]);

    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Error fetching lyrics:', err);
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

// JSON 404 — this is an API, callers should never get an HTML error page.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Terminal error handler — catches JSON parse errors, oversized bodies, the CORS rejection
// above, and anything else that throws. Never returns a stack trace or a filesystem path to the
// client; the real error is logged server-side only.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Malformed JSON in request body.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  res.status(err.status || 500).json({ error: 'Internal server error.' });
});

module.exports = app;
