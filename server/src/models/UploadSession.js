import mongoose from 'mongoose';

const uploadSessionSchema = new mongoose.Schema(
  {
    uploadId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    totalSize: {
      type: Number,
      required: true,
    },
    chunkSize: {
      type: Number,
      required: true,
    },
    totalChunks: {
      type: Number,
      required: true,
    },
    uploadedChunks: {
      type: [Number], // Array of successfully uploaded chunk numbers (1-indexed)
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'uploading', 'assembling', 'completed', 'failed'],
      default: 'pending',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
    },
    s3UploadId: {
      type: String, // AWS S3 Multipart Upload ID
    },
    s3Key: {
      type: String, // Temp key or final key path
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index to automatically remove expired sessions
    },
  },
  {
    timestamps: true,
  }
);

const UploadSession = mongoose.model('UploadSession', uploadSessionSchema);
export default UploadSession;
