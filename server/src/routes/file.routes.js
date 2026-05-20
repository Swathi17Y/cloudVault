import express from 'express';
import {
  initiateUpload,
  uploadChunk,
  completeUpload,
  getFiles,
  getFileMetadata,
  downloadFile,
  viewFile,
  deleteFile,
  moveFile,
  updateFile,
  abortUpload,
} from '../controllers/file.controller.js';
import { protect } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Protect all file routes
router.use(protect);

// Upload routes with separate rate limits for chunk processing
const uploadLimiter = rateLimiter({
  keyPrefix: 'rl:upload',
  windowMs: 60000,
  maxLimit: 120, // High ceiling for multiple chunk uploads
});

router.post('/upload/init', uploadLimiter, initiateUpload);
router.post('/upload/:sessionId/chunk', uploadLimiter, upload.single('chunk'), uploadChunk);
router.post('/upload/:sessionId/complete', uploadLimiter, completeUpload);
router.post('/upload/:sessionId/abort', uploadLimiter, abortUpload);

// Standard operations
router.get('/', getFiles);
router.get('/:id', getFileMetadata);
router.get('/:id/download', downloadFile);
router.get('/:id/view', viewFile);
router.delete('/:id', deleteFile);
router.patch('/:id/move', moveFile);
router.patch('/:id', updateFile);

export default router;
