import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import logger from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import fileRoutes from './routes/file.routes.js';
import folderRoutes from './routes/folder.routes.js';
import shareRoutes from './routes/share.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';

const app = express();

// Security HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS setup
const corsOptions = {
  origin: process.env.CORS_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Morgan HTTP request logging mapped to Winston stream
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', { stream: logger.stream }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Gzip compression
app.use(compression());

// Healthcheck endpoint (both paths for flexibility)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/analytics', analyticsRoutes);

// Fallback route
app.use('*', (req, res, next) => {
  const err = new Error(`Can't find ${req.originalUrl} on this server`);
  err.statusCode = 404;
  next(err);
});

// Central Error Handler Middleware
app.use(errorHandler);

export default app;
