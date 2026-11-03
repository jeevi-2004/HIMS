const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (_) {}

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
const ipdRoutes = require('./routes/ipdRoutes');

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
app.use('/api/ipd', ipdRoutes);

// 404 Catch-All Middleware for unmatched routes
app.use((req, res, next) => {
  const logMsg = `404 NOT FOUND: ${req.method} ${req.originalUrl}\n`;
  try {
    require('fs').appendFileSync('debug.log', logMsg);
  } catch (e) { }
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler Middleware
app.use(errorHandler);

// Self-healing server startup & port recovery
const { execSync } = require('child_process');

const freePortSync = (port) => {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      const lines = output.split('\n');
      const pids = new Set();
      for (const line of lines) {
        if (/LISTENING/i.test(line)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && parseInt(pid, 10) !== process.pid) {
            pids.add(pid);
          }
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[Auto-Recovery] Terminated orphan process PID ${pid} on port ${port}`);
        } catch (e) { }
      }
    } else {
      execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch (err) {
    // Port is free or no matching process
  }
};

const PORT = config.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
let server;

const startServer = (portToTry = PORT, retryCount = 0) => {
  server = app.listen(portToTry, HOST, () => {
    console.log(`Server running in ${config.NODE_ENV} mode on ${HOST}:${portToTry}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Port Conflict] Port ${portToTry} is in use.`);
      if (retryCount === 0) {
        console.log(`[Auto-Recovery] Automatically releasing port ${portToTry}...`);
        freePortSync(portToTry);
        setTimeout(() => {
          startServer(portToTry, retryCount + 1);
        }, 1000);
      } else {
        console.warn(`[Auto-Recovery] Re-binding fallback to port ${portToTry + 1}...`);
        startServer(portToTry + 1, retryCount + 1);
      }
    } else {
      console.error('Server error:', err);
    }
  });
};

startServer();

// Graceful shutdown handling for Windows & Nodemon
const handleShutdown = () => {
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

// Process-level resilience guards to prevent socket aborts/unhandled errors from terminating server
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION PREVENTED CRASH]:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION PREVENTED CRASH]:', reason?.message || reason);
});

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.once('SIGUSR2', () => {
  if (server) {
    server.close(() => {
      process.kill(process.pid, 'SIGUSR2');
    });
  } else {
    process.kill(process.pid, 'SIGUSR2');
  }
});

// Server active and ready for nodemon (auto-restarted)
module.exports = app;

