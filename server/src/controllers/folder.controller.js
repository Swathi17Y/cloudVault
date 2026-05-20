import Folder from '../models/Folder.js';
import File from '../models/File.js';
import { handleFileDeletion } from '../services/dedup.service.js';
import cache, {
  invalidateFolderCache,
  getCachedFolderListing,
  setCachedFolderListing
} from '../services/cache.service.js';
import logger from '../config/logger.js';

/**
 * @desc    Create a new folder
 * @route   POST /api/folders
 * @access  Private
 */
export const createFolder = async (req, res, next) => {
  try {
    const { name, parent } = req.body;

    if (!name) {
      const error = new Error('Please provide folder name');
      error.statusCode = 400;
      throw error;
    }

    const parentId = parent === 'root' || !parent ? null : parent;

    // Check if parent folder exists and is owned by the user
    let parentFolder = null;
    if (parentId) {
      parentFolder = await Folder.findOne({ _id: parentId, owner: req.user._id });
      if (!parentFolder) {
        const error = new Error('Parent folder not found or unauthorized');
        error.statusCode = 404;
        throw error;
      }
    }

    // Check for duplicate name in the same parent directory
    const existingFolder = await Folder.findOne({ name, owner: req.user._id, parent: parentId });
    if (existingFolder) {
      const error = new Error('A folder with this name already exists in this location');
      error.statusCode = 400;
      throw error;
    }

    // Calculate path and depth
    const path = parentFolder ? `${parentFolder.path}${parentFolder._id}/` : '/';
    const depth = parentFolder ? parentFolder.depth + 1 : 0;

    const folder = new Folder({
      name,
      owner: req.user._id,
      parent: parentId,
      path,
      depth,
    });

    await folder.save();

    // Clear caches
    await invalidateFolderCache(parentId, req.user._id);

    logger.info(`Folder created: "${name}" (ID: ${folder._id}) for user ${req.user._id}`);

    res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      folder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get folder contents (folders and files)
 * @route   GET /api/folders/:id/contents or /api/folders/root/contents
 * @access  Private
 */
export const getFolderContents = async (req, res, next) => {
  try {
    const idParam = req.params.id;
    const folderId = idParam === 'root' || !idParam ? null : idParam;

    let currentFolder = null;

    if (folderId) {
      currentFolder = await Folder.findOne({ _id: folderId, owner: req.user._id });
      if (!currentFolder) {
        const error = new Error('Folder not found or unauthorized');
        error.statusCode = 404;
        throw error;
      }
    }

    // Fetch from cache if exists
    const cachedContents = await getCachedFolderListing(folderId, req.user._id);
    if (cachedContents) {
      logger.info(`Serving folder contents from cache for folder: ${folderId || 'root'}`);
      return res.status(200).json({
        success: true,
        fromCache: true,
        data: cachedContents,
      });
    }

    // Fetch child folders
    const folders = await Folder.find({ owner: req.user._id, parent: folderId }).sort({ name: 1 });

    // Fetch active files in this folder
    const files = await File.find({ owner: req.user._id, folder: folderId, isDeleted: false }).sort({ name: 1 });

    const contents = {
      folder: currentFolder,
      folders,
      files,
    };

    // Cache the folder contents listing
    await setCachedFolderListing(folderId, req.user._id, contents);

    res.status(200).json({
      success: true,
      data: contents,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Recursively delete a folder and all its contents (subfolders + files)
 * @route   DELETE /api/folders/:id
 * @access  Private
 */
export const deleteFolder = async (req, res, next) => {
  try {
    const folderId = req.params.id;

    const folder = await Folder.findOne({ _id: folderId, owner: req.user._id });
    if (!folder) {
      const error = new Error('Folder not found');
      error.statusCode = 404;
      throw error;
    }

    const parentId = folder.parent;

    // Find all descendant subfolders recursively using materialized path index
    const descendantFolders = await Folder.find({
      owner: req.user._id,
      path: { $regex: `^${folder.path}${folder._id}/` },
    });

    const folderIdsToDelete = [folder._id, ...descendantFolders.map((f) => f._id)];

    // Fetch all active files within any of the target folders
    const filesToDelete = await File.find({
      owner: req.user._id,
      folder: { $in: folderIdsToDelete },
      isDeleted: false,
    });

    // Delete files recursively via deduplication-aware handler
    for (const file of filesToDelete) {
      await handleFileDeletion(file);
    }

    // Remove all folder records
    await Folder.deleteMany({ _id: { $in: folderIdsToDelete } });

    // Invalidate caches for all deleted folders
    await invalidateFolderCache(parentId, req.user._id);
    for (const fId of folderIdsToDelete) {
      await invalidateFolderCache(fId, req.user._id);
    }
    // Invalidate user files listing cache
    await cache.invalidatePattern(`user:${req.user._id}:files:*`);

    logger.info(`Folder and sub-contents deleted: ID ${folderId} (Total folders: ${folderIdsToDelete.length}, files: ${filesToDelete.length})`);

    res.status(200).json({
      success: true,
      message: 'Folder and all its contents deleted recursively',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Move folder and recursively update child materialized paths
 * @route   PATCH /api/folders/:id/move
 * @access  Private
 */
export const moveFolder = async (req, res, next) => {
  try {
    const folderId = req.params.id;
    const { parent } = req.body;

    const folder = await Folder.findOne({ _id: folderId, owner: req.user._id });
    if (!folder) {
      const error = new Error('Folder not found');
      error.statusCode = 404;
      throw error;
    }

    const oldParentId = folder.parent;
    const targetParentId = parent === 'root' || !parent ? null : parent;

    // Prevent moving to self
    if (targetParentId && targetParentId.toString() === folder._id.toString()) {
      const error = new Error('Cannot move a folder into itself');
      error.statusCode = 400;
      throw error;
    }

    let targetParent = null;
    if (targetParentId) {
      targetParent = await Folder.findOne({ _id: targetParentId, owner: req.user._id });
      if (!targetParent) {
        const error = new Error('Target parent folder not found');
        error.statusCode = 404;
        throw error;
      }

      // Prevent moving folder into its own descendant (avoids hierarchy cycles)
      if (targetParent.path.includes(`/${folder._id}/`)) {
        const error = new Error('Cannot move a folder into one of its subfolders');
        error.statusCode = 400;
        throw error;
      }
    }

    // Determine path updates
    const oldPrefix = `${folder.path}${folder._id}/`;
    const newParentPath = targetParent ? `${targetParent.path}${targetParent._id}/` : '/';
    const newPrefix = `${newParentPath}${folder._id}/`;

    const newDepth = targetParent ? targetParent.depth + 1 : 0;
    const depthDiff = newDepth - folder.depth;

    // Fetch all subfolders (descendants)
    const descendants = await Folder.find({
      owner: req.user._id,
      path: { $regex: `^${oldPrefix}` },
    });

    // Recursively update descendants' paths and depths
    for (const descendant of descendants) {
      const relativePath = descendant.path.substring(oldPrefix.length);
      descendant.path = `${newPrefix}${relativePath}`;
      descendant.depth += depthDiff;
      await descendant.save();
      await invalidateFolderCache(descendant._id, req.user._id);
    }

    // Update the parent folder itself
    folder.parent = targetParentId;
    folder.path = newParentPath;
    folder.depth = newDepth;
    await folder.save();

    // Invalidate caches
    await invalidateFolderCache(folder._id, req.user._id);
    await invalidateFolderCache(oldParentId, req.user._id);
    await invalidateFolderCache(targetParentId, req.user._id);
    await cache.invalidatePattern(`user:${req.user._id}:files:*`);

    logger.info(`Folder moved: ${folderId} from parent ${oldParentId || 'root'} to parent ${targetParentId || 'root'}`);

    res.status(200).json({
      success: true,
      message: 'Folder moved successfully',
      folder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update folder metadata (rename)
 * @route   PATCH /api/folders/:id
 * @access  Private
 */
export const updateFolder = async (req, res, next) => {
  try {
    const folderId = req.params.id;
    const { name } = req.body;

    if (!name) {
      const error = new Error('Please provide folder name');
      error.statusCode = 400;
      throw error;
    }

    const folder = await Folder.findOne({ _id: folderId, owner: req.user._id });
    if (!folder) {
      const error = new Error('Folder not found');
      error.statusCode = 404;
      throw error;
    }

    // Check for duplicate name in the same parent directory
    const existingFolder = await Folder.findOne({
      name,
      owner: req.user._id,
      parent: folder.parent,
      _id: { $ne: folder._id },
    });
    if (existingFolder) {
      const error = new Error('A folder with this name already exists in this location');
      error.statusCode = 400;
      throw error;
    }

    folder.name = name;
    await folder.save();

    // Invalidate caches
    await invalidateFolderCache(folder.parent, req.user._id);
    await invalidateFolderCache(folder._id, req.user._id);
    await cache.invalidatePattern(`user:${req.user._id}:files:*`);

    logger.info(`Folder renamed: "${name}" (ID: ${folder._id}) for user ${req.user._id}`);

    res.status(200).json({
      success: true,
      message: 'Folder updated successfully',
      folder,
    });
  } catch (error) {
    next(error);
  }
};
