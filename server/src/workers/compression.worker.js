import { Worker } from 'bullmq';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import s3Client, { BUCKET_NAME } from '../config/s3.js';
import { createRedisConnection } from '../config/redis.js';
import File from '../models/File.js';
import { compressBuffer } from '../services/compression.service.js';
import { invalidateFileCache, invalidateFolderCache } from '../services/cache.service.js';
import logger from '../config/logger.js';

const getS3ObjectBuffer = async (key) => {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  const response = await s3Client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const connection = createRedisConnection();

const compressionWorker = new Worker(
  'file-compression',
  async (job) => {
    const { fileId, userId } = job.data;
    logger.info(`Starting async compression worker for File: ${fileId}`);

    const file = await File.findOne({ _id: fileId, owner: userId, isDeleted: false });
    if (!file) {
      throw new Error(`File ${fileId} not found or deleted`);
    }

    // Skip if it's already compressed or if it's a deduplicated reference
    if (file.isCompressed || file.refCount > 1) {
      logger.info(`Skipping compression for ${file.name} (already compressed or shared key)`);
      return { skipped: true };
    }

    try {
      // 1. Download file buffer
      const originalBuffer = await getS3ObjectBuffer(file.storageKey);

      // 2. Perform compression (webp for images, gzip for text, ignore other types)
      const { buffer: compressedBuffer, mimeType, isCompressed, compressionRatio } = await compressBuffer(
        originalBuffer,
        file.mimeType
      );

      if (!isCompressed) {
        logger.info(`No storage savings achieved. Skipping replacement.`);
        return { compressed: false };
      }

      // 3. Upload compressed buffer to S3 (replacing the old object key)
      logger.info(`Uploading compressed file (${compressedBuffer.length} bytes) to S3: ${file.storageKey}`);
      const uploadCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.storageKey,
        Body: compressedBuffer,
        ContentType: mimeType,
      });
      await s3Client.send(uploadCommand);

      // 4. Update file document in database
      const oldSize = file.size;
      file.size = compressedBuffer.length;
      file.mimeType = mimeType;
      file.isCompressed = true;
      file.compressionRatio = compressionRatio;
      await file.save();

      // Deduct size difference from user's storageUsed
      const sizeDifference = oldSize - file.size;
      const User = (await import('../models/User.js')).default;
      await User.findByIdAndUpdate(userId, { $inc: { storageUsed: -sizeDifference } });

      // 5. Invalidate caches
      await invalidateFileCache(file._id, userId);
      await invalidateFolderCache(file.folder, userId);

      logger.info(`Successfully compressed file ${file.name}. Saved ${sizeDifference} bytes.`);
      return { compressed: true, bytesSaved: sizeDifference };

    } catch (error) {
      logger.error(`Error compressing file ${fileId}: ${error.message}`);
      throw error;
    }
  },
  {
    connection,
    concurrency: 1, // Run sequentially to avoid high memory spikes
  }
);

compressionWorker.on('completed', (job) => {
  logger.info(`Compression Job ${job.id} completed successfully`);
});

compressionWorker.on('failed', (job, err) => {
  logger.error(`Compression Job ${job.id} failed: ${err.message}`);
});

export default compressionWorker;
