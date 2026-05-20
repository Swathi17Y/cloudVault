import crypto from 'crypto';
import bcrypt from 'bcrypt';
import SharedLink from '../models/SharedLink.js';
import File from '../models/File.js';
import { generatePresignedDownloadUrl, generatePresignedViewUrl } from '../services/storage.service.js';
import logger from '../config/logger.js';

/**
 * @desc    Create a new shared link for a file
 * @route   POST /api/shares
 * @access  Private
 */
export const createShare = async (req, res, next) => {
  try {
    const { fileId, password, expiresInHours, maxDownloads, accessType } = req.body;

    if (!fileId) {
      const error = new Error('Please provide fileId');
      error.statusCode = 400;
      throw error;
    }

    // Verify file exists and belongs to current user
    const file = await File.findOne({ _id: fileId, owner: req.user._id, isDeleted: false });
    if (!file) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    // Generate unique secure token
    const token = crypto.randomBytes(24).toString('hex');

    // Securely hash password if provided
    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    // Calculate expiry date if relative hours provided
    let expiresAt = null;
    if (expiresInHours) {
      expiresAt = new Date(Date.now() + parseInt(expiresInHours, 10) * 60 * 60 * 1000);
    }

    const sharedLink = new SharedLink({
      file: fileId,
      sharedBy: req.user._id,
      accessType: accessType || 'download',
      token,
      password: hashedPassword,
      expiresAt,
      maxDownloads: maxDownloads !== undefined ? parseInt(maxDownloads, 10) : null,
    });

    await sharedLink.save();

    logger.info(`Shared link created: file ${fileId} by user ${req.user._id} (Token: ${token})`);

    res.status(201).json({
      success: true,
      message: 'Shared link created successfully',
      data: {
        id: sharedLink._id,
        token: sharedLink.token,
        accessType: sharedLink.accessType,
        expiresAt: sharedLink.expiresAt,
        maxDownloads: sharedLink.maxDownloads,
        passwordProtected: !!password,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Public endpoint to view or download a shared file using a token
 * @route   GET /api/shares/public/:token or POST /api/shares/public/:token (for password validation)
 * @access  Public
 */
export const getSharedFile = async (req, res, next) => {
  try {
    const { token } = req.params;

    const sharedLink = await SharedLink.findOne({ token, isActive: true }).populate('file');

    if (!sharedLink || !sharedLink.isValid()) {
      const error = new Error('Shared link is invalid or has expired');
      error.statusCode = 404;
      throw error;
    }

    if (!sharedLink.file || sharedLink.file.isDeleted) {
      const error = new Error('The shared file is no longer available');
      error.statusCode = 404;
      throw error;
    }

    // Verify password if protected
    if (sharedLink.password) {
      const passwordInput = req.body.password || req.query.password || req.headers['x-share-password'];

      if (!passwordInput) {
        return res.status(401).json({
          success: false,
          passwordRequired: true,
          message: 'Password is required to access this share',
        });
      }

      const isMatch = await bcrypt.compare(passwordInput, sharedLink.password);
      if (!isMatch) {
        const error = new Error('Incorrect password');
        error.statusCode = 401;
        throw error;
      }
    }

    // Generate S3 presigned URL depending on accessType
    let signedUrl;
    if (sharedLink.accessType === 'view') {
      signedUrl = await generatePresignedViewUrl(sharedLink.file.storageKey, sharedLink.file.mimeType);
    } else {
      signedUrl = await generatePresignedDownloadUrl(sharedLink.file.storageKey, sharedLink.file.originalName);
    }

    // Increment downloads count
    sharedLink.downloadCount += 1;
    await sharedLink.save();

    logger.info(`Shared link accessed: token ${token} (Access type: ${sharedLink.accessType})`);

    res.status(200).json({
      success: true,
      url: signedUrl,
      accessType: sharedLink.accessType,
      downloadCount: sharedLink.downloadCount,
      expiresAt: sharedLink.expiresAt,
      maxDownloads: sharedLink.maxDownloads,
      file: {
        name: sharedLink.file.name,
        size: sharedLink.file.size,
        mimeType: sharedLink.file.mimeType,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all shared links created by current user
 * @route   GET /api/shares/my-shares
 * @access  Private
 */
export const getMyShares = async (req, res, next) => {
  try {
    const shares = await SharedLink.find({ sharedBy: req.user._id })
      .populate('file', 'name size mimeType isDeleted')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      shares,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Revoke/delete a shared link
 * @route   DELETE /api/shares/:id
 * @access  Private
 */
export const revokeShare = async (req, res, next) => {
  try {
    const shareId = req.params.id;

    const share = await SharedLink.findOne({ _id: shareId, sharedBy: req.user._id });
    if (!share) {
      const error = new Error('Shared link not found');
      error.statusCode = 404;
      throw error;
    }

    await share.deleteOne();

    logger.info(`Shared link revoked: ID ${shareId} by user ${req.user._id}`);

    res.status(200).json({
      success: true,
      message: 'Shared link revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};
