import redis from '../config/redis.js';
import logger from '../config/logger.js';

const CACHE_TTL = {
  FILE: 300, // 5 minutes
  FOLDER: 600, // 10 minutes
  STORAGE_USAGE: 300, // 5 minutes
};

/**
 * Generic JSON Cache Set.
 */
const set = async (key, val, ttlSeconds) => {
  try {
    const stringVal = JSON.stringify(val);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, stringVal);
    } else {
      await redis.set(key, stringVal);
    }
  } catch (error) {
    logger.error(`Cache set failed for key ${key}:`, error);
  }
};

/**
 * Generic JSON Cache Get.
 */
const get = async (key) => {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch (error) {
    logger.error(`Cache get failed for key ${key}:`, error);
    return null;
  }
};

/**
 * Delete cache key.
 */
export const invalidateKey = async (key) => {
  try {
    await redis.del(key);
    logger.debug(`Cache invalidated for key: ${key}`);
  } catch (error) {
    logger.error(`Cache delete failed for key ${key}:`, error);
  }
};

/**
 * Pattern-based invalidation (e.g. invalidate all folder keys on update).
 */
export const invalidatePattern = async (pattern) => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.debug(`Cache invalidated pattern: ${pattern} (${keys.length} keys)`);
    }
  } catch (error) {
    logger.error(`Cache delete pattern failed for ${pattern}:`, error);
  }
};

// --- Cache Helpers for Domain Models ---

export const getCachedFile = async (fileId) => {
  return get(`file:${fileId}`);
};

export const setCachedFile = async (fileId, fileData) => {
  return set(`file:${fileId}`, fileData, CACHE_TTL.FILE);
};

export const invalidateFileCache = async (fileId, ownerId) => {
  await invalidateKey(`file:${fileId}`);
  if (ownerId) {
    await invalidateKey(`user:${ownerId}:storage`);
  }
};

export const getCachedFolderListing = async (folderId, userId) => {
  const key = folderId ? `folder:${folderId}:list` : `folder:root:${userId}:list`;
  return get(key);
};

export const setCachedFolderListing = async (folderId, userId, listing) => {
  const key = folderId ? `folder:${folderId}:list` : `folder:root:${userId}:list`;
  return set(key, listing, CACHE_TTL.FOLDER);
};

export const invalidateFolderCache = async (folderId, userId) => {
  if (folderId) {
    await invalidateKey(`folder:${folderId}:list`);
  }
  await invalidateKey(`folder:root:${userId}:list`);
};

export const getCachedStorageUsage = async (userId) => {
  return get(`user:${userId}:storage`);
};

export const setCachedStorageUsage = async (userId, usageData) => {
  return set(`user:${userId}:storage`, usageData, CACHE_TTL.STORAGE_USAGE);
};

export default {
  set,
  get,
  invalidateKey,
  invalidatePattern,
  getCachedFile,
  setCachedFile,
  invalidateFileCache,
  getCachedFolderListing,
  setCachedFolderListing,
  invalidateFolderCache,
  getCachedStorageUsage,
  setCachedStorageUsage,
};
