// Import required libraries
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// Create Express app
const app = express();

// Middleware - functions that run before your routes
app.use(cors()); // Allow frontend to connect
app.use(express.json()); // Parse JSON from requests

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'notesdb',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Create notes table on startup
pool.query(`
  CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log('Notes table ready'))
  .catch(err => console.error('DB error:', err));

// REST API Routes (endpoints)

// GET / - Root endpoint (welcome message)
app.get('/', (req, res) => {
  res.json({ 
    message: 'Note Taking API',
    endpoints: {
      'GET /api/notes': 'Get all notes',
      'POST /api/notes': 'Create a note',
      'DELETE /api/notes/:id': 'Delete a note',
      'GET /api/health': 'Health check'
    }
  });
});

// GET /api/notes - Get all notes
app.get('/api/notes', async (req, res) => {
  const result = await pool.query('SELECT * FROM notes ORDER BY id DESC');
  res.json(result.rows);
});

// POST /api/notes - Create a new note
app.post('/api/notes', async (req, res) => {
  const { title, content } = req.body;
  const result = await pool.query(
    'INSERT INTO notes (title, content) VALUES ($1, $2) RETURNING *',
    [title, content]
  );
  res.status(201).json(result.rows[0]);
});

// DELETE /api/notes/:id - Delete a note by ID
app.delete('/api/notes/:id', async (req, res) => {
  await pool.query('DELETE FROM notes WHERE id = $1', [parseInt(req.params.id)]);
  res.status(204).send();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
