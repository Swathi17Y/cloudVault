import File from '../models/File.js';
import Folder from '../models/Folder.js';
import User from '../models/User.js';
import { initiateSession, saveChunk, requestAssembly, abortSession } from '../services/chunk.service.js';
import { handleFileDeletion } from '../services/dedup.service.js';
import { generatePresignedDownloadUrl, generatePresignedViewUrl } from '../services/storage.service.js';
import cache, {
  getCachedFile,
  setCachedFile,
  invalidateFileCache,
  invalidateFolderCache
} from '../services/cache.service.js';
import upload from '../middleware/upload.js';
import logger from '../config/logger.js';

// Helper to run multer middleware inside uploadChunk handler if not already processed by router
const runMulter = (req, res) => {
  return new Promise((resolve, reject) => {
    upload.single('chunk')(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

/**
 * @desc    Initiate a chunked upload session
 * @route   POST /api/files/upload/initiate
 * @access  Private
 */
export const initiateUpload = async (req, res, next) => {
  try {
    const { filename, totalSize, chunkSize, mimeType, folderId } = req.body;

    if (!filename || !totalSize || !chunkSize || !mimeType) {
      const error = new Error('Please provide filename, totalSize, chunkSize, and mimeType');
      error.statusCode = 400;
      throw error;
    }

    // Verify folder ownership if folderId is provided
    if (folderId && folderId !== 'root') {
      const folder = await Folder.findOne({ _id: folderId, owner: req.user._id });
      if (!folder) {
        const error = new Error('Target folder not found or unauthorized');
        error.statusCode = 400;
        throw error;
      }
    }

    const sessionInfo = await initiateSession({
      filename,
      totalSize: parseInt(totalSize, 10),
      chunkSize: parseInt(chunkSize, 10),
      mimeType,
      userId: req.user._id,
      folderId: folderId === 'root' || !folderId ? null : folderId,
    });

    res.status(200).json({
      success: true,
      message: 'Upload session initiated successfully',
      data: sessionInfo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload file chunk
 * @route   POST /api/files/upload/chunk
 * @access  Private
 */
export const uploadChunk = async (req, res, next) => {
  try {
    // Check if multer has already parsed req.file, otherwise parse it here
    if (!req.file) {
      try {
        await runMulter(req, res);
      } catch (err) {
        const error = new Error(`Multer error: ${err.message}`);
        error.statusCode = 400;
        throw error;
      }
    }

    if (!req.file) {
      const error = new Error('No chunk file received');
      error.statusCode = 400;
      throw error;
    }

    const uploadId = req.params.sessionId || req.body.uploadId || req.query.uploadId;
    const chunkIndexStr = req.body.chunkIndex || req.query.chunkIndex;

    if (!uploadId || chunkIndexStr === undefined) {
      const error = new Error('Please provide uploadId and chunkIndex');
      error.statusCode = 400;
      throw error;
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    const result = await saveChunk(uploadId, chunkIndex, req.file.buffer, req.user._id);

    res.status(200).json({
      success: true,
      message: `Chunk ${chunkIndex} uploaded successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Complete upload and trigger background assembly
 * @route   POST /api/files/upload/complete
 * @access  Private
 */
export const completeUpload = async (req, res, next) => {
  try {
    const uploadId = req.params.sessionId || req.body.uploadId;

    if (!uploadId) {
      const error = new Error('Please provide uploadId');
      error.statusCode = 400;
      throw error;
    }

    const result = await requestAssembly(uploadId, req.user._id);

    // Invalidate pagination caches since a new file is being assembled/created
    await cache.invalidatePattern(`user:${req.user._id}:files:*`);
    await invalidateFolderCache(null, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Assembly request triggered successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Abort upload session and clean up S3 multipart parts
 * @route   POST /api/files/upload/:sessionId/abort
 * @access  Private
 */
export const abortUpload = async (req, res, next) => {
  try {
    const uploadId = req.params.sessionId || req.body.uploadId;

    if (!uploadId) {
      const error = new Error('Please provide uploadId');
      error.statusCode = 400;
      throw error;
    }

    await abortSession(uploadId, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Upload session aborted and cleaned up successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get paginated files list for user, with search and folder filter support
 * @route   GET /api/files
 * @access  Private
 */
export const getFiles = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const folderId = req.query.folder || '';

    // Generate unique cache key
    const cacheKey = `user:${req.user._id}:files:page:${page}:limit:${limit}:search:${search}:folder:${folderId}`;

    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      logger.info(`Serving files list from cache for user: ${req.user._id}`);
      return res.status(200).json({
        success: true,
        fromCache: true,
        ...cachedData,
      });
    }

    // Build DB Query
    const query = { owner: req.user._id, isDeleted: false };

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    if (folderId) {
      query.folder = folderId === 'root' || folderId === 'null' ? null : folderId;
    }

    const total = await File.countDocuments(query);
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const responseData = {
      files,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };

    // Cache results for 5 minutes
    await cache.set(cacheKey, responseData, 300);

    res.status(200).json({
      success: true,
      ...responseData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single file metadata (cached)
 * @route   GET /api/files/:id/metadata
 * @access  Private
 */
export const getFileMetadata = async (req, res, next) => {
  try {
    const fileId = req.params.id;

    // Try fetching from cache
    let file = await getCachedFile(fileId);

    if (file) {
      // Validate ownership
      if (file.owner.toString() !== req.user._id.toString() || file.isDeleted) {
        const error = new Error('File not found or unauthorized');
        error.statusCode = 404;
        throw error;
      }
      logger.info(`Serving metadata from cache for file: ${fileId}`);
    } else {
      // Fetch from Database
      file = await File.findOne({ _id: fileId, owner: req.user._id, isDeleted: false });
      if (!file) {
        const error = new Error('File not found');
        error.statusCode = 404;
        throw error;
      }

      // Cache the metadata
      await setCachedFile(fileId, file);
    }

    res.status(200).json({
      success: true,
      file,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get S3 download URL
 * @route   GET /api/files/:id/download
 * @access  Private
 */
export const downloadFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;

    const file = await File.findOne({ _id: fileId, owner: req.user._id, isDeleted: false });
    if (!file) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    const downloadUrl = await generatePresignedDownloadUrl(file.storageKey, file.originalName);

    logger.info(`Generated download URL for file: ${file._id}`);

    res.status(200).json({
      success: true,
      downloadUrl,
      file: {
        id: file._id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get S3 view URL (for rendering in browser)
 * @route   GET /api/files/:id/view
 * @access  Private
 */
export const viewFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;

    const file = await File.findOne({ _id: fileId, owner: req.user._id, isDeleted: false });
    if (!file) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    const viewUrl = await generatePresignedViewUrl(file.storageKey, file.mimeType);

    logger.info(`Generated view URL for file: ${file._id}`);

    res.status(200).json({
      success: true,
      viewUrl,
      file: {
        id: file._id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Soft-delete a file and handle S3 cleanup if refCount drops to 0
 * @route   DELETE /api/files/:id
 * @access  Private
 */
export const deleteFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;

    const file = await File.findOne({ _id: fileId, owner: req.user._id, isDeleted: false });
    if (!file) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    const folderId = file.folder;

    // soft deletes and handles S3 de-duplication check + adjusts user storage usage internally
    await handleFileDeletion(file);

    // Invalidate caches
    await invalidateFolderCache(folderId, req.user._id);
    await cache.invalidatePattern(`user:${req.user._id}:files:*`);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Move a file to a new folder
 * @route   PATCH /api/files/:id/move
 * @access  Private
 */
export const moveFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const { folderId } = req.body;

    const file = await File.findOne({ _id: fileId, owner: req.user._id, isDeleted: false });
    if (!file) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    const oldFolderId = file.folder;
    let targetFolderId = null;

    if (folderId && folderId !== 'root') {
      const targetFolder = await Folder.findOne({ _id: folderId, owner: req.user._id });
      if (!targetFolder) {
        const error = new Error('Target folder not found');
        error.statusCode = 400;
        throw error;
      }
      targetFolderId = targetFolder._id;
    }

    file.folder = targetFolderId;
    await file.save();

    // Invalidate caches
    await invalidateFileCache(fileId, req.user._id);
    await invalidateFolderCache(oldFolderId, req.user._id);
    if (targetFolderId) {
      await invalidateFolderCache(targetFolderId, req.user._id);
    }
    await cache.invalidatePattern(`user:${req.user._id}:files:*`);

    res.status(200).json({
      success: true,
      message: 'File moved successfully',
      file,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a file's metadata (tags, name)
 * @route   PATCH /api/files/:id
 * @access  Private
 */
export const updateFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const { name, tags } = req.body;

    const file = await File.findOne({ _id: fileId, owner: req.user._id, isDeleted: false });
    if (!file) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    if (name) file.name = name;
    if (tags) file.tags = tags;
    await file.save();

    // Invalidate caches
    await invalidateFileCache(fileId, req.user._id);
    await invalidateFolderCache(file.folder, req.user._id);
    await cache.invalidatePattern(`user:${req.user._id}:files:*`);

    res.status(200).json({
      success: true,
      message: 'File updated successfully',
      file,
    });
  } catch (error) {
    next(error);
  }
};
