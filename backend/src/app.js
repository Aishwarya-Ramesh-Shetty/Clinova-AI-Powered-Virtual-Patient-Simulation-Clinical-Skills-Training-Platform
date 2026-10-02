const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { sendResponse } = require('./utils/helpers');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const symptomRoutes = require('./routes/symptomRoutes');

const app = express();

// CORS configuration
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin, credentials: true }));

// Parse JSON bodies
app.use(express.json());

// HTTP request logger
app.use(morgan('dev'));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health-check endpoint
app.get('/api/health', (req, res) => {
  sendResponse(
    res,
    200,
    {
      status: 'OK',
      service: 'Clinova Backend API',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    },
    'Clinova Backend API is running successfully'
  );
});

// Authentication Routes
app.use('/api/auth', authRoutes);

// Symptom Assessment Routes
app.use('/api/symptoms', symptomRoutes);

// Basic global error-handling middleware
app.use(errorHandler);

module.exports = app;
