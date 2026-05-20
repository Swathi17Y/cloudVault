import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import UploadSession from '../models/UploadSession.js';
import File from '../models/File.js';
import { abortMultipartUpload } from '../services/storage.service.js';
import logger from '../config/logger.js';

const connection = createRedisConnection();

const cleanupWorker = new Worker(
  'cleanup',
  async (job) => {
    logger.info('Running background cleanup worker tasks...');

    // 1. Purge expired Upload Sessions and clear their S3 multipart parts
    const expiredSessions = await UploadSession.find({ expiresAt: { $lt: new Date() } });
    logger.info(`Found ${expiredSessions.length} expired upload sessions for purging`);

    for (const session of expiredSessions) {
      try {
        logger.info(`Aborting S3 parts for expired session: ${session.uploadId}`);
        await abortMultipartUpload(session.s3Key, session.s3UploadId);
      } catch (s3Err) {
        logger.warn(`Failed to abort S3 upload parts for ${session.uploadId}: ${s3Err.message}`);
      }
      await session.deleteOne();
    }

    // 2. Fully purge soft-deleted files that have exceeded 30 days retention
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const filesToPurge = await File.find({
      isDeleted: true,
      deletedAt: { $lt: thirtyDaysAgo },
    });

    logger.info(`Found ${filesToPurge.length} soft-deleted files older than 30 days for permanent purge`);

    const { handleFileDeletion } = await import('../services/dedup.service.js');
    for (const file of filesToPurge) {
      try {
        // handleFileDeletion takes care of dedup-aware reference decrements and S3 deletion
        await handleFileDeletion(file);
        // Hard delete document from database
        await file.deleteOne();
        logger.info(`Permanently deleted file document: ${file.name}`);
      } catch (err) {
        logger.error(`Failed purging file doc ${file._id}: ${err.message}`);
      }
    }

    return {
      expiredSessionsCleaned: expiredSessions.length,
      purgedFiles: filesToPurge.length,
    };
  },
  {
    connection,
  }
);

cleanupWorker.on('completed', (job) => {
  logger.info(`Cleanup Job ${job.id} completed successfully`);
});

cleanupWorker.on('failed', (job, err) => {
  logger.error(`Cleanup Job ${job.id} failed: ${err.message}`);
});

export default cleanupWorker;
