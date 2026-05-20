import redis from '../config/redis.js';
import logger from '../config/logger.js';

/**
 * Sliding window rate limiter using Redis sorted sets (ZSET).
 * @param {Object} options Configuration parameters.
 * @param {string} options.keyPrefix Prefix for Redis keys.
 * @param {number} options.windowMs Time window in milliseconds.
 * @param {number} options.maxLimit Max number of requests allowed in the window.
 */
export const rateLimiter = ({ keyPrefix = 'rl', windowMs = 60000, maxLimit = 100 }) => {
  return async (req, res, next) => {
    // Identify client by IP or user ID if authenticated
    const identifier = req.user ? req.user._id.toString() : req.ip;
    const redisKey = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const clearBefore = now - windowMs;

    try {
      // Multi-exec transactional queue to perform operations atomically
      const pipeline = redis.pipeline();
      
      // Remove elements older than windowMs
      pipeline.zremrangebyscore(redisKey, 0, clearBefore);
      
      // Add current request timestamp to the set
      pipeline.zadd(redisKey, now, now);
      
      // Count total elements in the window
      pipeline.zcard(redisKey);
      
      // Refresh key expiry so it cleans up when idle
      pipeline.pexpire(redisKey, windowMs);

      const results = await pipeline.exec();
      
      // Get the response of zcard (which is the 3rd operation, index 2)
      // ioredis returns array of [err, result] for each pipeline operation
      const requestCount = results[2][1];

      res.setHeader('X-RateLimit-Limit', maxLimit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxLimit - requestCount));
      res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

      if (requestCount > maxLimit) {
        logger.warn(`Rate limit exceeded for client: ${identifier} on route ${req.originalUrl}`);
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({
          success: false,
          message: 'Too many requests, please try again later.',
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter redis failure:', error);
      // Fallback: don't block user requests in production if Redis goes down, just log it
      next();
    }
  };
};
