import User from '../models/User.js';
import File from '../models/File.js';
import cache, { getCachedStorageUsage, setCachedStorageUsage } from '../services/cache.service.js';
import logger from '../config/logger.js';

/**
 * @desc    Get storage usage statistics (cached)
 * @route   GET /api/analytics/storage-usage
 * @access  Private
 */
export const getStorageUsage = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Check Redis cache first
    const cachedData = await getCachedStorageUsage(userId);
    if (cachedData) {
      logger.info(`Serving storage usage from cache for user: ${userId}`);
      return res.status(200).json({
        success: true,
        fromCache: true,
        data: cachedData,
      });
    }

    // Retrieve fresh data from database
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const usageData = {
      storageUsed: user.storageUsed,
      storageLimit: user.storageLimit,
      remainingStorage: Math.max(0, user.storageLimit - user.storageUsed),
      percentageUsed: user.storageLimit > 0
        ? parseFloat(((user.storageUsed / user.storageLimit) * 100).toFixed(2))
        : 0,
    };

    // Cache the storage usage
    await setCachedStorageUsage(userId, usageData);

    res.status(200).json({
      success: true,
      data: usageData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get upload activity timeline aggregated by date (last 30 days)
 * @route   GET /api/analytics/upload-activity
 * @access  Private
 */
export const getUploadActivity = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Filter to last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activity = await File.aggregate([
      {
        $match: {
          owner: userId,
          isDeleted: false,
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          totalSize: { $sum: '$size' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: activity,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get file type distribution grouped by MIME categories
 * @route   GET /api/analytics/file-distribution
 * @access  Private
 */
export const getFileTypeDistribution = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Aggregate by mimeType first
    const rawDistribution = await File.aggregate([
      {
        $match: {
          owner: userId,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$mimeType',
          count: { $sum: 1 },
          totalSize: { $sum: '$size' },
        },
      },
    ]);

    // Categorize MIME types in JavaScript
    const distribution = {
      image: { count: 0, totalSize: 0 },
      media: { count: 0, totalSize: 0 },
      document: { count: 0, totalSize: 0 },
      archive: { count: 0, totalSize: 0 },
      other: { count: 0, totalSize: 0 },
    };

    for (const item of rawDistribution) {
      const mime = (item._id || '').toLowerCase();
      let category = 'other';

      if (mime.startsWith('image/')) {
        category = 'image';
      } else if (mime.startsWith('video/') || mime.startsWith('audio/')) {
        category = 'media';
      } else if (
        mime.startsWith('text/') ||
        mime.includes('pdf') ||
        mime.includes('document') ||
        mime.includes('sheet') ||
        mime.includes('msword') ||
        mime.includes('excel') ||
        mime.includes('powerpoint') ||
        mime.includes('office')
      ) {
        category = 'document';
      } else if (
        mime.includes('zip') ||
        mime.includes('tar') ||
        mime.includes('gzip') ||
        mime.includes('rar') ||
        mime.includes('7z') ||
        mime.includes('compressed')
      ) {
        category = 'archive';
      }

      distribution[category].count += item.count;
      distribution[category].totalSize += item.totalSize;
    }

    res.status(200).json({
      success: true,
      data: distribution,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get deduplication savings (sums saving: count * duplicate_sizes)
 * @route   GET /api/analytics/dedup-savings
 * @access  Private
 */
export const getDeduplicationSavings = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // 1. User-specific duplicates (same user uploading identical files to different folders)
    const userDuplicates = await File.aggregate([
      {
        $match: {
          owner: userId,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$storageKey',
          count: { $sum: 1 },
          size: { $first: '$size' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    let userSavingsBytes = 0;
    let userDuplicateCount = 0;
    userDuplicates.forEach((item) => {
      userDuplicateCount += item.count - 1;
      userSavingsBytes += (item.count - 1) * item.size;
    });

    // 2. System-wide duplicates (where user files share storage key with ANY other files in the system)
    const userFiles = await File.find({ owner: userId, isDeleted: false }, 'storageKey size');
    const storageKeys = userFiles.map((f) => f.storageKey);

    const systemDuplicates = await File.aggregate([
      {
        $match: {
          storageKey: { $in: storageKeys },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$storageKey',
          count: { $sum: 1 },
          size: { $first: '$size' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    let systemSavingsBytes = 0;
    let systemDuplicateCount = 0;
    systemDuplicates.forEach((item) => {
      systemDuplicateCount += item.count - 1;
      systemSavingsBytes += (item.count - 1) * item.size;
    });

    res.status(200).json({
      success: true,
      data: {
        userLevel: {
          duplicateCount: userDuplicateCount,
          savingsBytes: userSavingsBytes,
        },
        systemLevel: {
          duplicateCount: systemDuplicateCount,
          savingsBytes: systemSavingsBytes,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
