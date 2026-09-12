const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static HTML/CSS/JS files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// A simple backend health-check route
app.get('/api/status', (req, res) => {
  res.json({ status: 'App is running successfully!' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
