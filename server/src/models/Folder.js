import mongoose from 'mongoose';

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },
    path: {
      type: String,
      default: '/',
      index: true, // Materialized path (e.g. "/parentFolderId/childFolderId/")
    },
    depth: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index to ensure unique folder names within the same directory for a specific owner
folderSchema.index({ name: 1, owner: 1, parent: 1 }, { unique: true });

const Folder = mongoose.model('Folder', folderSchema);
export default Folder;
