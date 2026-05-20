import zlib from 'zlib';
import { promisify } from 'util';
import sharp from 'sharp';
import logger from '../config/logger.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Eligible mime types for text compression
const TEXT_MIMES = [
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
  'image/svg+xml',
];

// Eligible mime types for image optimization
const IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Checks if a mime type is eligible for text compression (GZIP).
 */
export const isCompressibleText = (mimeType) => {
  return TEXT_MIMES.includes(mimeType.toLowerCase());
};

/**
 * Checks if a mime type is eligible for image optimization (Sharp).
 */
export const isCompressibleImage = (mimeType) => {
  return IMAGE_MIMES.includes(mimeType.toLowerCase());
};

/**
 * Compresses file data buffer.
 * - Converts image formats to optimized WebP.
 * - Gzips textual files.
 * - Leaves pre-compressed files (PDF, ZIP, MP3, etc.) unmodified.
 * 
 * @param {Buffer} buffer The source file buffer.
 * @param {string} mimeType Mime-type identifier.
 * @returns {Promise<{buffer: Buffer, mimeType: string, isCompressed: boolean, compressionRatio: number}>}
 */
export const compressBuffer = async (buffer, mimeType) => {
  const originalSize = buffer.length;
  let compressedBuffer = buffer;
  let targetMimeType = mimeType;
  let isCompressed = false;

  try {
    if (isCompressibleImage(mimeType)) {
      logger.info(`Applying image WebP compression. Original size: ${originalSize} bytes`);
      // Convert to optimized webp format
      compressedBuffer = await sharp(buffer)
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
      
      targetMimeType = 'image/webp';
      isCompressed = compressedBuffer.length < originalSize;
    } else if (isCompressibleText(mimeType)) {
      logger.info(`Applying text Gzip compression. Original size: ${originalSize} bytes`);
      compressedBuffer = await gzip(buffer);
      isCompressed = compressedBuffer.length < originalSize;
    }

    if (!isCompressed) {
      logger.debug(`Skipping compression; no storage optimization gained.`);
      return {
        buffer,
        mimeType,
        isCompressed: false,
        compressionRatio: 1,
      };
    }

    const compressedSize = compressedBuffer.length;
    const ratio = parseFloat((originalSize / compressedSize).toFixed(2));
    logger.info(`Compression complete. Compressed size: ${compressedSize} bytes (Ratio: ${ratio}x)`);

    return {
      buffer: compressedBuffer,
      mimeType: targetMimeType,
      isCompressed: true,
      compressionRatio: ratio,
    };
  } catch (error) {
    logger.error('Buffer compression service encountered an error:', error);
    // Fall back to original file if compression crashes
    return {
      buffer,
      mimeType,
      isCompressed: false,
      compressionRatio: 1,
    };
  }
};

/**
 * Decompresses text elements if previously zipped.
 */
export const decompressBuffer = async (buffer, mimeType, isCompressed) => {
  if (!isCompressed || !isCompressibleText(mimeType)) {
    return buffer;
  }
  try {
    return await gunzip(buffer);
  } catch (error) {
    logger.error('Failed decompressing buffer:', error);
    throw error;
  }
};
export default {
  compressBuffer,
  decompressBuffer,
  isCompressibleImage,
  isCompressibleText,
};
