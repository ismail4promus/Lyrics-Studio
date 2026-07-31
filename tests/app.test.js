const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');

// No live MongoDB in this test environment — mongoose.connection.readyState stays 0
// (disconnected) for the whole suite. That's deliberately used below to exercise the
// database-unavailable guard paths without needing a real database.

describe('GET /health', () => {
  it('reports degraded when the database is not connected', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', db: 'disconnected' });
  });
});

describe('database-unavailable guard', () => {
  it('GET /lyrics returns 503 immediately instead of hanging', async () => {
    const res = await request(app).get('/lyrics');
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /lyrics returns 503 immediately instead of hanging', async () => {
    const res = await request(app)
      .post('/lyrics')
      .send({ title: 'a', artist: 'b', lyrics: 'c' });
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error');
  });
});

describe('error handling middleware', () => {
  it('returns a clean 400 for malformed JSON — no stack trace or file path', async () => {
    const res = await request(app)
      .post('/lyrics')
      .set('Content-Type', 'application/json')
      .send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON in request body.' });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/\/[A-Za-z0-9_\-./]+\.js:\d+/); // no "/path/to/file.js:NN" style path
    expect(raw.toLowerCase()).not.toContain('at parse');
  });

  it('returns 413 for an oversized body', async () => {
    const res = await request(app)
      .post('/lyrics')
      .set('Content-Type', 'application/json')
      .send({ title: 'a', artist: 'b', lyrics: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Request body too large.' });
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404, not an HTML page', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('security headers', () => {
  it('does not send X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Lyric schema validation', () => {
  // Requiring app.js registers the model on mongoose's default connection registry — no live
  // connection needed to run schema-level validation.
  const Lyric = mongoose.model('Lyric');

  it('rejects a missing required field', () => {
    const err = new Lyric({ title: 'a', artist: 'b' }).validateSync();
    expect(err.errors.lyrics).toBeDefined();
  });

  it('rejects a whitespace-only title after trimming', () => {
    const err = new Lyric({ title: '   ', artist: 'b', lyrics: 'c' }).validateSync();
    expect(err.errors.title).toBeDefined();
  });

  it('rejects a title over the length limit', () => {
    const err = new Lyric({ title: 'a'.repeat(301), artist: 'b', lyrics: 'c' }).validateSync();
    expect(err.errors.title).toBeDefined();
  });

  it('accepts a valid document', () => {
    const err = new Lyric({ title: 'a', artist: 'b', lyrics: 'c' }).validateSync();
    expect(err).toBeUndefined();
  });
});
