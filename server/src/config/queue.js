import { Queue } from 'bullmq';
import { createRedisConnection } from './redis.js';
import logger from './logger.js';

const connection = createRedisConnection();

// Upload assembly queue - processes chunk assembly into final files
export const uploadQueue = new Queue('upload-assembly', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// Compression queue - processes file compression
export const compressionQueue = new Queue('file-compression', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// Cleanup queue - processes expired sessions, orphaned chunks
export const cleanupQueue = new Queue('cleanup', {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
  },
});

logger.info('BullMQ queues initialized: upload-assembly, file-compression, cleanup');

export default { uploadQueue, compressionQueue, cleanupQueue };
