require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB SETUP ---
const db = new sqlite3.Database('./db.sqlite');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      external_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_url TEXT,
      year INTEGER,
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

// Get watched movies for user
app.get('/api/users/:userId/movies', (req, res) => {
  const userId = Number(req.params.userId);
  db.all(
    `SELECT id, external_id, title, poster_url, year, added_at
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
  const { external_id, title, poster_url, year } = req.body;

  if (!external_id || !title) {
    return res.status(400).json({ error: 'external_id and title are required' });
  }

  const addedAt = new Date().toISOString();

  db.run(
    `INSERT OR IGNORE INTO movies (user_id, external_id, title, poster_url, year, added_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, external_id, title, poster_url || null, year || null, addedAt],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB error' });
      }

      // If row ignored because of UNIQUE, just return ok
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

// Proxy search to TVMaze (no key needed)
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();

  if (!q) {
    return res.json({ results: [] });
  }

  try {
    const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`;

    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      console.error('TVMaze error:', response.status, text);
      return res.status(500).json({ error: 'TVMaze error' });
    }

    const data = await response.json();

    // shape from your example: [{ score, show: {...} }, ...]
    const mapped = (data || []).map(item => {
      const s = item.show || {};
      const premiered = s.premiered || null;
      const year = premiered ? Number(premiered.slice(0, 4)) : null;
      const image = s.image || {};
      const poster = image.original || image.medium || null;

      return {
        external_id: s.id,
        title: s.name,
        year,
        poster_url: poster
      };
    });

    res.json({ results: mapped });
  } catch (e) {
    console.error('Search error:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
