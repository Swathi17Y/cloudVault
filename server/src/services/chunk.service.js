import { v4 as uuidv4 } from 'uuid';
import UploadSession from '../models/UploadSession.js';
import User from '../models/User.js';
import { initiateMultipartUpload, uploadPart, completeMultipartUpload, abortMultipartUpload } from './storage.service.js';
import { uploadQueue } from '../config/queue.js';
import logger from '../config/logger.js';

const SESSION_EXPIRY_MS = (parseInt(process.env.UPLOAD_SESSION_EXPIRY) || 86400) * 1000;

/**
 * Initializes a chunked upload session and gets an S3 multipart ID.
 */
export const initiateSession = async ({ filename, totalSize, chunkSize, mimeType, userId, folderId }) => {
  // Check user storage limits
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (user.storageUsed + totalSize > user.storageLimit) {
    const err = new Error('Insufficient storage capacity limits');
    err.statusCode = 400;
    throw err;
  }

  const uploadId = uuidv4();
  const s3Key = `uploads/${userId}/${uploadId}-${filename}`;
  const totalChunks = Math.ceil(totalSize / chunkSize);

  logger.info(`Initiating Upload Session: ${uploadId} for file: ${filename} (Chunks: ${totalChunks})`);

  // Get Amazon S3 Multipart Upload ID
  const s3UploadId = await initiateMultipartUpload(s3Key, mimeType);

  const session = new UploadSession({
    uploadId,
    filename,
    totalSize,
    chunkSize,
    totalChunks,
    uploadedChunks: [],
    status: 'pending',
    owner: userId,
    folder: folderId || null,
    s3UploadId,
    s3Key,
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
  });

  await session.save();

  return {
    uploadId,
    chunkSize,
    totalChunks,
    expectedChunks: totalChunks,
  };
};

/**
 * Processes a chunk upload from the client.
 */
export const saveChunk = async (uploadId, chunkIndex, buffer, userId) => {
  const session = await UploadSession.findOne({ uploadId, owner: userId });
  if (!session) {
    const err = new Error('Upload session not found or expired');
    err.statusCode = 404;
    throw err;
  }

  if (session.status === 'completed' || session.status === 'assembling') {
    const err = new Error(`Upload session has already been processed or completed (${session.status})`);
    err.statusCode = 400;
    throw err;
  }

  // 1-indexed parts required by S3
  const partNumber = chunkIndex + 1;

  logger.info(`Uploading chunk #${partNumber}/${session.totalChunks} for session: ${uploadId}`);

  // Upload to S3 Multipart Upload directly
  const etag = await uploadPart(session.s3Key, session.s3UploadId, partNumber, buffer);

  // Update session status and record the successful chunk
  // We double-check if chunk already added, to prevent duplication on retries
  if (!session.uploadedChunks.includes(partNumber)) {
    session.uploadedChunks.push(partNumber);
    session.status = 'uploading';
    await session.save();
  }

  return {
    uploadId,
    chunkIndex,
    uploadedChunksCount: session.uploadedChunks.length,
    totalChunks: session.totalChunks,
    isComplete: session.uploadedChunks.length === session.totalChunks,
  };
};

/**
 * Triggers background assembly of the chunk components.
 * Moves processing to a BullMQ worker for reliability and retry capabilities.
 */
export const requestAssembly = async (uploadId, userId) => {
  const session = await UploadSession.findOne({ uploadId, owner: userId });
  if (!session) {
    const err = new Error('Upload session not found');
    err.statusCode = 404;
    throw err;
  }

  if (session.uploadedChunks.length < session.totalChunks) {
    const err = new Error(`Cannot assemble: only ${session.uploadedChunks.length}/${session.totalChunks} chunks uploaded`);
    err.statusCode = 400;
    throw err;
  }

  session.status = 'assembling';
  await session.save();

  // Add job to BullMQ queue for async processing
  const job = await uploadQueue.add('assemble-chunks', {
    uploadId: session.uploadId,
    userId: userId.toString(),
  });

  logger.info(`Added assembly job ${job.id} for session ${uploadId}`);

  return {
    uploadId,
    status: 'assembling',
    jobId: job.id,
  };
};

/**
 * Aborts an upload session and cleans S3 parts.
 */
export const abortSession = async (uploadId, userId) => {
  const session = await UploadSession.findOne({ uploadId, owner: userId });
  if (!session) return;

  logger.info(`Aborting upload session: ${uploadId}`);
  try {
    await abortMultipartUpload(session.s3Key, session.s3UploadId);
  } catch (error) {
    logger.warn(`Failed to abort S3 Multipart Upload during cancel: ${error.message}`);
  }
  await session.deleteOne();
};
