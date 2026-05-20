import mongoose from 'mongoose';

const sharedLinkSchema = new mongoose.Schema(
  {
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true,
      index: true,
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sharedWith: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    accessType: {
      type: String,
      enum: ['view', 'download'],
      default: 'download',
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true, // Shared link access token
    },
    password: {
      type: String, // Optional password access
      default: null,
    },
    expiresAt: {
      type: Date, // Optional expiration date
      default: null,
    },
    maxDownloads: {
      type: Number, // Optional download limit
      default: null,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Method to verify access validity
sharedLinkSchema.methods.isValid = function () {
  if (!this.isActive) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  if (this.maxDownloads !== null && this.downloadCount >= this.maxDownloads) return false;
  return true;
};

const SharedLink = mongoose.model('SharedLink', sharedLinkSchema);
export default SharedLink;
