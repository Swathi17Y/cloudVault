import express from 'express';
import {
  createFolder,
  getFolderContents,
  deleteFolder,
  moveFolder,
  updateFolder,
} from '../controllers/folder.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', createFolder);
router.get('/:id?', getFolderContents); // Optional folder ID (null / empty indicates root folder)
router.delete('/:id', deleteFolder);
router.patch('/:id/move', moveFolder);
router.patch('/:id', updateFolder);

export default router;
