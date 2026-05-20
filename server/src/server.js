import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

import app from './app.js';
import connectDB from './config/db.js';
import logger from './config/logger.js';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Establish Database Connection
    await connectDB();

    // 2. Start Listening
    const server = app.listen(PORT, () => {
      logger.info(`CloudVault API Gateway running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });

    // Graceful Shutdown
    const shutdown = (signal) => {
      logger.warn(`Received ${signal} signal. Shutting down server gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        try {
          const mongoose = (await import('mongoose')).default;
          await mongoose.connection.close();
          logger.info('MongoDB connection closed.');
          
          const { default: redis } = await import('./config/redis.js');
          await redis.quit();
          logger.info('Redis connection closed.');
          
          process.exit(0);
        } catch (err) {
          logger.error('Error during graceful shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
