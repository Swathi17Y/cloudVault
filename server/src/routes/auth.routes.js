import express from 'express';
import { register, login, refresh, getMe } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Strict rate limit on auth endpoints
const authLimiter = rateLimiter({
  keyPrefix: 'rl:auth',
  windowMs: 60000,
  maxLimit: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);
router.get('/me', protect, getMe);

export default router;
