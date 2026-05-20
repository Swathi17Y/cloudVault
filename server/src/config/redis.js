import Redis from 'ioredis';
import logger from './logger.js';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
};

const redis = new Redis(redisConfig);

redis.on('connect', () => {
  logger.info(`Redis connected: ${redisConfig.host}:${redisConfig.port}`);
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err.message);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Create a duplicate connection for BullMQ subscriber
export const createRedisConnection = () => new Redis(redisConfig);

export default redis;
