require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

if (!OMDB_API_KEY) {
  console.error('OMDB_API_KEY is missing in env');
  process.exit(1);
}

// --- DB SETUP ---
const db = new sqlite3.Database('./db.sqlite');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);

  // external_id is TEXT now (imdbID or manual-*), type is TEXT (movie/series/manual/etc)
  db.run(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_url TEXT,
      year INTEGER,
      type TEXT,
      added_at TEXT NOT NULL,
      UNIQUE (user_id, external_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Seed 3 users if table empty
  db.get(`SELECT COUNT(*) AS count FROM users`, (err, row) => {
    if (err) {
      console.error('Error checking users table:', err);
      return;
    }
    if (row.count === 0) {
      const stmt = db.prepare(`INSERT INTO users (name) VALUES (?)`);
      ['Person 1', 'Person 2', 'Person 3'].forEach(name => {
        stmt.run(name);
      });
      stmt.finalize();
      console.log('Seeded users table with 3 users');
    }
  });
});

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

// Get all users
app.get('/api/users', (req, res) => {
  db.all(`SELECT id, name FROM users ORDER BY id`, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

// Get watched movies for a user
app.get('/api/users/:userId/movies', (req, res) => {
  const userId = Number(req.params.userId);

  db.all(
    `SELECT id, external_id, title, poster_url, year, type, added_at
     FROM movies
     WHERE user_id = ?
     ORDER BY added_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB error' });
      }
      res.json(rows);
    }
  );
});

// Add movie to watched list
app.post('/api/users/:userId/movies', (req, res) => {
  const userId = Number(req.params.userId);
  const { external_id, title, poster_url, year, type } = req.body;

  if (!external_id || !title) {
    return res.status(400).json({ error: 'external_id and title are required' });
  }

  const addedAt = new Date().toISOString();

  db.run(
    `INSERT OR IGNORE INTO movies (user_id, external_id, title, poster_url, year, type, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, external_id, title, poster_url || null, year || null, type || null, addedAt],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB error' });
      }

      if (this.changes === 0) {
        return res.json({ status: 'exists' });
      }

      res.status(201).json({
        id: this.lastID,
        user_id: userId,
        external_id,
        title,
        poster_url,
        year,
        type,
        added_at: addedAt
      });
    }
  );
});

// Remove movie
app.delete('/api/users/:userId/movies/:movieId', (req, res) => {
  const userId = Number(req.params.userId);
  const movieId = Number(req.params.movieId);

  db.run(
    `DELETE FROM movies WHERE id = ? AND user_id = ?`,
    [movieId, userId],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json({ status: 'deleted' });
    }
  );
});

// OMDb search
// Uses: ?s=title&type=movie (we keep type filter as movie by default)
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();

  if (!q) {
    return res.json({ results: [] });
  }

  try {
    const params = new URLSearchParams({
      apikey: OMDB_API_KEY,
      s: q,
      type: 'movie' // remove this if you also want series etc
    });

    const url = `https://www.omdbapi.com/?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error('OMDb HTTP error:', response.status, text);
      return res.status(500).json({ error: 'OMDb HTTP error' });
    }

    const data = await response.json();

    if (data.Response === 'False') {
      // e.g. { Response: "False", Error: "Movie not found!" }
      return res.json({ results: [] });
    }

    const mapped = (data.Search || []).map(item => {
      const title = item.Title || '';
      const yearStr = item.Year || '';
      const year = /^\d{4}$/.test(yearStr) ? Number(yearStr) : null;
      const poster = item.Poster && item.Poster !== 'N/A' ? item.Poster : null;
      const type = item.Type || null; // movie, series, etc
      const external_id = item.imdbID; // e.g. tt3896198

      return {
        external_id,
        title,
        year,
        poster_url: poster,
        type
      };
    });

    res.json({ results: mapped });
  } catch (e) {
    console.error('OMDb search error:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
