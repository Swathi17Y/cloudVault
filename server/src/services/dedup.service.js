import crypto from 'crypto';
import File from '../models/File.js';
import User from '../models/User.js';
import { deleteFromS3 } from './storage.service.js';
import { invalidateFileCache } from './cache.service.js';
import logger from '../config/logger.js';

/**
 * Computes a SHA-256 hash from a file buffer.
 */
export const computeHash = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Checks if a file with the given hash already exists in the system.
 */
export const findDuplicateByHash = async (sha256Hash) => {
  return await File.findOne({ sha256Hash, isDeleted: false });
};

/**
 * Deduplicates a file document if an identical file hash exists.
 * Updates the existing file reference counter and assigns the shared storage path.
 * 
 * @param {Object} fileParams Properties of the newly uploaded file.
 * @param {string} sha256Hash SHA-256 hash.
 * @param {Object} duplicateDoc The existing duplicate File document.
 * @returns {Promise<Object>} The saved File record.
 */
export const deduplicateFile = async (fileParams, sha256Hash, duplicateDoc) => {
  logger.info(`Deduplicating file "${fileParams.name}" using duplicate storage key: ${duplicateDoc.storageKey}`);

  // Increment the refCount of the original file
  await File.findByIdAndUpdate(duplicateDoc._id, { $inc: { refCount: 1 } });

  // Create a new File document pointing to the existing storage key
  const newFile = new File({
    name: fileParams.name,
    originalName: fileParams.originalName,
    mimeType: fileParams.mimeType,
    size: fileParams.size,
    storageKey: duplicateDoc.storageKey,
    sha256Hash,
    owner: fileParams.owner,
    folder: fileParams.folder || null,
    isCompressed: duplicateDoc.isCompressed,
    compressionRatio: duplicateDoc.compressionRatio,
    refCount: 1, // Individual files start at 1, pointing to the key
    metadata: duplicateDoc.metadata,
  });

  await newFile.save();

  // Update user's storage consumption
  await User.findByIdAndUpdate(fileParams.owner, { $inc: { storageUsed: fileParams.size } });
  await invalidateFileCache(newFile._id, fileParams.owner);

  return newFile;
};

/**
 * Deduplication-aware deletion. Decrements the reference count of the S3 file.
 * Only deletes from S3 when no other active database record references it.
 */
export const handleFileDeletion = async (fileDoc) => {
  logger.info(`Processing deletion for File document ID: ${fileDoc._id} (Key: ${fileDoc.storageKey})`);

  // Hard delete check if soft-deleted items are being fully purged,
  // or simple soft deletion. For simplicity, this handles soft delete.
  fileDoc.isDeleted = true;
  fileDoc.deletedAt = new Date();
  await fileDoc.save();

  // Find other active records referencing the same S3 Key
  const activeReferencesCount = await File.countDocuments({
    storageKey: fileDoc.storageKey,
    isDeleted: false,
  });

  if (activeReferencesCount === 0) {
    // No more active records require the S3 asset, delete it
    logger.info(`No active references remain for S3 key: ${fileDoc.storageKey}. Deleting from storage...`);
    try {
      await deleteFromS3(fileDoc.storageKey);
    } catch (error) {
      logger.error(`Deduplication S3 deletion cleanup failed for ${fileDoc.storageKey}: ${error.message}`);
    }
  } else {
    logger.info(`${activeReferencesCount} active references remain for S3 key: ${fileDoc.storageKey}. S3 object retained.`);
  }

  // Deduct storage capacity from user limit
  await User.findByIdAndUpdate(fileDoc.owner, { $inc: { storageUsed: -fileDoc.size } });
  await invalidateFileCache(fileDoc._id, fileDoc.owner);
};
