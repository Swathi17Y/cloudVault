import { Worker } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import s3Client, { BUCKET_NAME } from '../config/s3.js';
import { createRedisConnection } from '../config/redis.js';
import UploadSession from '../models/UploadSession.js';
import File from '../models/File.js';
import User from '../models/User.js';
import { completeMultipartUpload } from '../services/storage.service.js';
import { findDuplicateByHash, deduplicateFile } from '../services/dedup.service.js';
import { compressBuffer } from '../services/compression.service.js';
import { computeHash } from '../services/dedup.service.js';
import { invalidateFolderCache, invalidateFileCache } from '../services/cache.service.js';
import { compressionQueue } from '../config/queue.js';
import logger from '../config/logger.js';

// Helper to read S3 stream into a full buffer for hash computation and compression
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

const uploadWorker = new Worker(
  'upload-assembly',
  async (job) => {
    const { uploadId, userId } = job.data;
    logger.info(`Starting async chunk assembly worker for UploadSession: ${uploadId}`);

    const session = await UploadSession.findOne({ uploadId, owner: userId });
    if (!session) {
      throw new Error(`UploadSession ${uploadId} not found in database`);
    }

    try {
      // 1. Get all parts uploaded in S3 and compile their ETags.
      // S3 CompleteMultipartUpload requires parts structured with ETag & PartNumber.
      // We will queries parts from S3 directly or approximate from the uploaded list.
      // For simplicity and alignment with S3 uploadPart, we fetch parts list.
      // In this setup, we can fetch from S3, or because we uploaded chunks sequentially, 
      // we need the ETags.
      // Wait, how do we get the ETags for S3 Multipart upload?
      // When we ran `uploadPart`, we didn't save the ETags to MongoDB!
      // Ah! We need to make sure the ETags are saved during upload, OR we can query them from S3.
      // Let's check S3 ListParts. Or let's modify the session object to store ETags!
      // Let's write S3 parts list query. S3 Client provides ListPartsCommand.
      // Let's implement that! It's much cleaner than saving ETags in Mongo.
      
      const { ListPartsCommand } = await import('@aws-sdk/client-s3');
      const listCommand = new ListPartsCommand({
        Bucket: BUCKET_NAME,
        Key: session.s3Key,
        UploadId: session.s3UploadId,
      });
      const partsData = await s3Client.send(listCommand);
      
      const s3Parts = (partsData.Parts || []).map((p) => ({
        PartNumber: p.PartNumber,
        ETag: p.ETag,
      }));

      if (s3Parts.length < session.totalChunks) {
        throw new Error(`S3 list parts found ${s3Parts.length} parts, expected ${session.totalChunks}`);
      }

      // 2. Complete Multipart Upload in S3
      logger.info(`Finalizing S3 Multipart compile for ${session.filename}...`);
      await completeMultipartUpload(session.s3Key, session.s3UploadId, s3Parts);

      // 3. Download the full file buffer from S3 to compute SHA-256 hash
      // and check for duplicates (for file deduplication).
      logger.info(`Downloading file from S3 to compute hash...`);
      const fileBuffer = await getS3ObjectBuffer(session.s3Key);
      const sha256Hash = computeHash(fileBuffer);
      logger.info(`Computed SHA-256 hash: ${sha256Hash}`);

      // 4. Run Deduplication check
      const duplicate = await findDuplicateByHash(sha256Hash);
      if (duplicate) {
        // If an identical file exists, delete the S3 object we just compiled
        // to save storage. Points the new record to the old storage key.
        logger.info(`Deduplication match found! Purging newly compiled S3 object: ${session.s3Key}`);
        
        const fileParams = {
          name: session.filename,
          originalName: session.filename,
          mimeType: duplicate.mimeType, // Keep duplicate mime type
          size: session.totalSize,
          owner: session.owner,
          folder: session.folder,
        };

        const fileDoc = await deduplicateFile(fileParams, sha256Hash, duplicate);
        
        // Remove S3 object since we're pointing to the existing one
        try {
          const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
          await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: session.s3Key }));
        } catch (s3DelErr) {
          logger.warn(`Failed to clean duplicate S3 object ${session.s3Key}: ${s3DelErr.message}`);
        }

        session.status = 'completed';
        await session.save();
        await invalidateFolderCache(session.folder, session.owner);
        return { fileId: fileDoc._id, deduplicated: true };
      }

      // 5. If not duplicate, create a new File document
      const fileDoc = new File({
        name: session.filename,
        originalName: session.filename,
        mimeType: 'application/octet-stream', // Fallback, will update during compression/checks
        size: session.totalSize,
        storageKey: session.s3Key,
        sha256Hash,
        owner: session.owner,
        folder: session.folder,
        refCount: 1,
      });

      // Fetch headers to find correct mime-type if possible or guess from extension
      const mime = (await import('mime-types')).default;
      const detectedMime = mime.lookup(session.filename) || 'application/octet-stream';
      fileDoc.mimeType = detectedMime;

      await fileDoc.save();

      // Update User storage usage
      await User.findByIdAndUpdate(session.owner, { $inc: { storageUsed: session.totalSize } });

      session.status = 'completed';
      await session.save();

      // 6. Invalidate redis caches
      await invalidateFolderCache(session.folder, session.owner);
      await invalidateFileCache(fileDoc._id, session.owner);

      // 7. Enqueue compression job (Smart compression backend feature)
      await compressionQueue.add('compress-file', {
        fileId: fileDoc._id.toString(),
        userId: userId,
      });

      logger.info(`Successfully completed chunk assembly for file: ${session.filename}`);
      return { fileId: fileDoc._id, deduplicated: false };

    } catch (error) {
      logger.error(`Error during assembly for upload ${uploadId}: ${error.message}`);
      session.status = 'failed';
      await session.save();
      throw error;
    }
  },
  {
    connection,
    concurrency: 2, // Process max 2 assembly jobs concurrently
  }
);

uploadWorker.on('completed', (job) => {
  logger.info(`Chunk assembly Job ${job.id} completed successfully`);
});

uploadWorker.on('failed', (job, err) => {
  logger.error(`Chunk assembly Job ${job.id} failed: ${err.message}`);
});

export default uploadWorker;
