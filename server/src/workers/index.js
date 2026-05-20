import logger from '../config/logger.js';
import connectDB from '../config/db.js';

// Import workers to initialize their event listeners
import './upload.worker.js';
import './compression.worker.js';
import './cleanup.worker.js';

// Setup periodic cleanup cron job if worker is running
import { cleanupQueue } from '../config/queue.js';

const initWorkers = async () => {
  try {
    await connectDB();
    logger.info('Database connected in worker instance.');

    // Schedule cleanup job to run every hour
    // BullMQ supports repeatable jobs
    await cleanupQueue.add(
      'periodic-cleanup',
      {},
      {
        repeat: {
          pattern: '0 * * * *', // Every hour
        },
        jobId: 'hourly-cleanup-job',
      }
    );

    logger.info('CloudVault background workers running successfully.');
  } catch (error) {
    logger.error('Failed to initialize workers:', error);
    process.exit(1);
  }
};

initWorkers();
