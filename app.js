require('dotenv').config(); // Load environment variables
const express = require('express'); // Web framework
const mongoose = require('mongoose'); // MongoDB ORM
const bodyParser = require('body-parser'); // Middleware for parsing JSON
const cors = require('cors'); // Enable CORS

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON data in requests

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Lyrics Schema and Model
const LyricsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  lyrics: { type: String, required: true },
});

const Lyrics = mongoose.model('Lyrics', LyricsSchema);

// POST /lyrics Endpoint
app.post('/lyrics', async (req, res) => {
  try {
    console.log('Request Body:', req.body); // Debugging line
    const newLyric = new Lyrics(req.body); // Create a new lyric document
    const savedLyric = await newLyric.save(); // Save the lyric to the database
    res.status(201).json(savedLyric); // Respond with the saved lyric
  } catch (err) {
    console.error('Error adding lyric:', err); // Log the error for debugging
    res.status(400).json({
      error: 'Failed to add lyrics',
      details: err.message
    }); // Respond with detailed error
  }
});
app.get('/lyrics', async (req, res) => {
    try {
        const lyrics = await Lyrics.find();
        res.json(lyrics);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lyrics' });
    }
});


// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
