import multer from 'multer';

// Use memory storage for quick buffers, as chunked upload segments are small
// and will be streamed/uploaded directly to AWS S3 / MinIO.
const storage = multer.memoryStorage();

// Validate file limits
const limits = {
  fileSize: parseInt(process.env.CHUNK_SIZE) || 5242880, // Default 5MB per chunk limit
};

const upload = multer({
  storage,
  limits,
  fileFilter: (req, file, cb) => {
    // We accept all types; the actual validation is performed downstream or not restricted
    cb(null, true);
  },
});

export default upload;
