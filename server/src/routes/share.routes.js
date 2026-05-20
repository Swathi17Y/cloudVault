import express from 'express';
import {
  createShare,
  getSharedFile,
  getMyShares,
  revokeShare,
} from '../controllers/share.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public route to access shared links
router.get('/access/:token', getSharedFile);

// Protected routes to manage share links
router.use(protect);
router.post('/', createShare);
router.get('/my-shares', getMyShares);
router.delete('/:id', revokeShare);

export default router;
