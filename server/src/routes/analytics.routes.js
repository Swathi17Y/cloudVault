import express from 'express';
import {
  getStorageUsage,
  getUploadActivity,
  getFileTypeDistribution,
  getDeduplicationSavings,
} from '../controllers/analytics.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/storage', getStorageUsage);
router.get('/uploads', getUploadActivity);
router.get('/file-types', getFileTypeDistribution);
router.get('/dedup-savings', getDeduplicationSavings);

export default router;
