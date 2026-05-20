import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    storageKey: {
      type: String,
      required: true, // Key in S3
    },
    sha256Hash: {
      type: String,
      required: true,
      index: true, // For deduplication
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },
    isCompressed: {
      type: Boolean,
      default: false,
    },
    compressionRatio: {
      type: Number,
      default: 1, // originalSize / compressedSize
    },
    refCount: {
      type: Number,
      default: 1, // Reference count for deduplication
    },
    metadata: {
      dimensions: {
        width: Number,
        height: Number,
      },
      duration: Number, // For audio/video files
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups
fileSchema.index({ owner: 1, folder: 1, isDeleted: 1 });
fileSchema.index({ sha256Hash: 1 });

const File = mongoose.model('File', fileSchema);
export default File;
