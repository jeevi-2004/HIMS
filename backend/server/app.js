const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/config');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/error');

// Import routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const operationalRoutes = require('./routes/operationalRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const ttsRoutes = require('./routes/ttsRoutes');

// Connect to MongoDB
connectDB();

const app = express();

// Security Middlewares
app.use(helmet());

// Configure CORS
app.use(cors({
  origin: '*', // Allow all origins for local environment, can restrict in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request Logging
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Body parsers with increased payload limit for pre-printed stationary backgrounds & high-res assets
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health Check API
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// Mounting API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/operations', operationalRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/tts', ttsRoutes);

// Global Error Handler Middleware
app.use(errorHandler);

// Start server
const PORT = config.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Server running in ${config.NODE_ENV} mode on ${HOST}:${PORT}`);
});

module.exports = app;
