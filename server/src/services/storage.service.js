import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import s3Client, { signingS3Client, BUCKET_NAME } from '../config/s3.js';
import logger from '../config/logger.js';

/**
 * Direct upload of a single buffer to S3.
 */
export const uploadToS3 = async (key, buffer, contentType) => {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await s3Client.send(command);
    logger.info(`S3 file upload success: ${key}`);
    return key;
  } catch (error) {
    logger.error(`S3 file upload failed for key ${key}: ${error.message}`);
    throw error;
  }
};

/**
 * Deletes a file key from S3.
 */
export const deleteFromS3 = async (key) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
    logger.info(`S3 file delete success: ${key}`);
  } catch (error) {
    logger.error(`S3 file delete failed for key ${key}: ${error.message}`);
    throw error;
  }
};

/**
 * Initiates an S3 multipart upload session.
 * @returns {Promise<string>} S3 UploadId
 */
export const initiateMultipartUpload = async (key, contentType) => {
  try {
    const command = new CreateMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });
    const response = await s3Client.send(command);
    return response.UploadId;
  } catch (error) {
    logger.error(`S3 Multipart Initiation failed for key ${key}: ${error.message}`);
    throw error;
  }
};

/**
 * Uploads a specific part/chunk of a multipart upload.
 */
export const uploadPart = async (key, s3UploadId, partNumber, body) => {
  try {
    const command = new UploadPartCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: s3UploadId,
      PartNumber: partNumber,
      Body: body,
    });
    const response = await s3Client.send(command);
    return response.ETag;
  } catch (error) {
    logger.error(`S3 UploadPart failed (Key: ${key}, Part: ${partNumber}): ${error.message}`);
    throw error;
  }
};

/**
 * Finalizes S3 multipart upload by compiling all uploaded parts.
 * @param {Array<{PartNumber: number, ETag: string}>} parts List of parts
 */
export const completeMultipartUpload = async (key, s3UploadId, parts) => {
  try {
    const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
    const command = new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: s3UploadId,
      MultipartUpload: { Parts: sortedParts },
    });
    await s3Client.send(command);
    logger.info(`S3 Multipart Upload Complete for key: ${key}`);
  } catch (error) {
    logger.error(`S3 Complete Multipart failed for key ${key}: ${error.message}`);
    throw error;
  }
};

/**
 * Aborts a multipart upload, cleaning up temporary parts in S3.
 */
export const abortMultipartUpload = async (key, s3UploadId) => {
  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: s3UploadId,
    });
    await s3Client.send(command);
    logger.info(`S3 Multipart Upload Aborted (Key: ${key}, ID: ${s3UploadId})`);
  } catch (error) {
    logger.error(`S3 Abort Multipart failed for key ${key}: ${error.message}`);
  }
};

/**
 * Generates a signed download URL for safe retrieval.
 */
export const generatePresignedDownloadUrl = async (key, originalFilename, expiresInSeconds = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(originalFilename)}"`,
    });
    return await getSignedUrl(signingS3Client, command, { expiresIn: expiresInSeconds });
  } catch (error) {
    logger.error(`Failed to generate signed download URL for key ${key}: ${error.message}`);
    throw error;
  }
};

/**
 * Generates a signed view URL for browser rendering.
 */
export const generatePresignedViewUrl = async (key, mimeType, expiresInSeconds = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentType: mimeType,
    });
    return await getSignedUrl(signingS3Client, command, { expiresIn: expiresInSeconds });
  } catch (error) {
    logger.error(`Failed to generate signed view URL for key ${key}: ${error.message}`);
    throw error;
  }
};
