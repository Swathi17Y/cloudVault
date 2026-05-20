import { S3Client } from '@aws-sdk/client-s3';
import logger from './logger.js';

const s3Config = {
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// Use MinIO endpoint for local development
if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
  s3Config.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
}

const s3Client = new S3Client(s3Config);

// Setup a signing client that uses localhost rather than container hostname
// for URL generation to ensure host-based browsers can resolve and authenticate with MinIO
let signingClientConfig = { ...s3Config };
if (process.env.S3_ENDPOINT && process.env.S3_ENDPOINT.includes('minio')) {
  signingClientConfig.endpoint = process.env.S3_ENDPOINT.replace('minio', 'localhost');
}
export const signingS3Client = new S3Client(signingClientConfig);

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'cloudvault-storage';

logger.info(`S3 configured: region=${s3Config.region}, bucket=${BUCKET_NAME}${s3Config.endpoint ? `, endpoint=${s3Config.endpoint}` : ''}`);

export default s3Client;
