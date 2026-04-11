// Import required libraries
const express = require('express');
const cors = require('cors');

// Create Express app
const app = express();

// Middleware - functions that run before your routes
app.use(cors()); // Allow frontend to connect
app.use(express.json()); // Parse JSON from requests

// In-memory storage (temporary - resets when server restarts)
let notes = [];
let nextId = 1;

// REST API Routes (endpoints)

// GET / - Root endpoint (welcome message)
app.get('/', (req, res) => {
  res.json({ 
    message: 'Note Taking API',
    endpoints: {
      'GET /notes': 'Get all notes',
      'POST /notes': 'Create a note',
      'DELETE /notes/:id': 'Delete a note',
      'GET /health': 'Health check'
    }
  });
});

// GET /notes - Get all notes
app.get('/notes', (req, res) => {
  res.json(notes);
});

// POST /notes - Create a new note
app.post('/notes', (req, res) => {
  const { title, content } = req.body;
  const newNote = {
    id: nextId++,
    title,
    content,
    createdAt: new Date()
  };
  notes.push(newNote);
  res.status(201).json(newNote);
});

// DELETE /notes/:id - Delete a note by ID
app.delete('/notes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  notes = notes.filter(note => note.id !== id);
  res.status(204).send();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
