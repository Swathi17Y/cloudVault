import { useState, useRef } from 'react';
import apiClient from '../api/client.js';

const DEFAULT_CHUNK_SIZE = 5242880; // 5MB chunks
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export const useChunkUpload = () => {
  const [uploads, setUploads] = useState({});
  const activeUploadsRef = useRef({});

  // Helper to update specific upload's state
  const updateUploadState = (fileId, updates) => {
    setUploads((prev) => {
      const current = prev[fileId] || {};
      const next = { ...current, ...updates };
      return { ...prev, [fileId]: next };
    });
  };

  /**
   * Upload a chunk with retry logic and exponential backoff
   */
  const uploadChunkWithRetry = async ({ sessionId, chunkIndex, chunkBlob, fileId, attempt = 1 }) => {
    // Check if upload was aborted/cancelled
    if (!activeUploadsRef.current[fileId]?.active) {
      throw new Error('Upload aborted');
    }

    const formData = new FormData();
    formData.append('chunk', chunkBlob);

    try {
      await apiClient.post(`/files/upload/${sessionId}/chunk`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        params: {
          chunkIndex,
          uploadId: sessionId,
        },
      });

      // Update completed list for this session
      const uploadRef = activeUploadsRef.current[fileId];
      if (uploadRef) {
        uploadRef.completedChunks.add(chunkIndex);
        const progress = Math.round((uploadRef.completedChunks.size / uploadRef.totalChunks) * 100);
        
        // Calculate instantaneous speed and ETA
        const durationSec = (Date.now() - uploadRef.startTime) / 1000;
        const uploadedBytes = uploadRef.completedChunks.size * uploadRef.chunkSize;
        const bytesPerSec = uploadedBytes / durationSec;
        const speedMbps = ((bytesPerSec * 8) / 1000000).toFixed(2);
        
        const remainingBytes = uploadRef.totalSize - uploadedBytes;
        const etaSeconds = bytesPerSec > 0 ? Math.ceil(remainingBytes / bytesPerSec) : 0;

        updateUploadState(fileId, {
          progress,
          uploadedChunks: Array.from(uploadRef.completedChunks),
          speed: `${speedMbps} Mbps`,
          eta: etaSeconds > 0 ? `${etaSeconds}s` : 'Calculating...',
        });
      }
    } catch (error) {
      if (attempt < MAX_RETRIES && activeUploadsRef.current[fileId]?.active) {
        const backoff = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Chunk ${chunkIndex} upload failed (attempt ${attempt}). Retrying in ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return uploadChunkWithRetry({ sessionId, chunkIndex, chunkBlob, fileId, attempt: attempt + 1 });
      }
      throw error;
    }
  };

  /**
   * Main Upload Function
   */
  const uploadFile = async (file, folderId = null) => {
    const fileId = `${file.name}-${file.size}-${Date.now()}`;
    const chunkSize = DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(file.size / chunkSize);

    const initialUploadState = {
      id: fileId,
      filename: file.name,
      totalSize: file.size,
      progress: 0,
      status: 'pending',
      uploadedChunks: [],
      speed: '0 Mbps',
      eta: 'Calculating...',
    };

    setUploads((prev) => ({ ...prev, [fileId]: initialUploadState }));

    activeUploadsRef.current[fileId] = {
      active: true,
      file,
      totalSize: file.size,
      chunkSize,
      totalChunks,
      completedChunks: new Set(),
      startTime: Date.now(),
    };

    try {
      updateUploadState(fileId, { status: 'initializing' });

      // 1. Initialize Upload Session on backend
      const initResponse = await apiClient.post('/files/upload/init', {
        filename: file.name,
        totalSize: file.size,
        chunkSize,
        mimeType: file.type,
        folderId,
      });

      console.log('Upload init response:', initResponse.data);
      const { uploadId } = initResponse.data.data || {};
      console.log('Extracted uploadId:', uploadId);
      activeUploadsRef.current[fileId].sessionId = uploadId;

      updateUploadState(fileId, { status: 'uploading' });

      // 2. Prepare chunks and schedule parallel uploads (concurrency = 3)
      const chunkPromises = [];
      const concurrencyLimit = 3;
      const uploadRef = activeUploadsRef.current[fileId];

      const uploadPool = async () => {
        for (let i = 0; i < totalChunks; i++) {
          // Check if session was cancelled/paused
          if (!uploadRef.active) break;

          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunkBlob = file.slice(start, end);

          // Standard promise throttling
          const promise = uploadChunkWithRetry({
            sessionId: uploadId,
            chunkIndex: i,
            chunkBlob,
            fileId,
          });

          chunkPromises.push(promise);

          // Simple queue concurrency ceiling throttle
          if (chunkPromises.length >= concurrencyLimit) {
            await Promise.race(chunkPromises);
          }
        }
      };

      await uploadPool();
      await Promise.all(chunkPromises);

      // Verify all chunks completed
      if (uploadRef.completedChunks.size < totalChunks) {
        throw new Error('Some file chunks failed to upload.');
      }

      // 3. Finalize/Complete upload trigger
      updateUploadState(fileId, { status: 'assembling', progress: 99 });
      await apiClient.post(`/files/upload/${uploadId}/complete`, { uploadId });
      
      updateUploadState(fileId, { status: 'completed', progress: 100, speed: 'Done', eta: '0s' });
      delete activeUploadsRef.current[fileId];
      return { success: true, filename: file.name };

    } catch (error) {
      const status = activeUploadsRef.current[fileId]?.active ? 'failed' : 'cancelled';
      updateUploadState(fileId, {
        status,
        speed: '0 Mbps',
        eta: '--',
        error: error.message || 'Upload failed',
      });
      delete activeUploadsRef.current[fileId];
      return { success: false, error: error.message };
    }
  };

  /**
   * Cancel active upload
   */
  const cancelUpload = async (fileId) => {
    const uploadRef = activeUploadsRef.current[fileId];
    if (uploadRef) {
      uploadRef.active = false;
      const sessionId = uploadRef.sessionId;
      updateUploadState(fileId, { status: 'cancelled' });
      
      try {
        if (sessionId) {
          // Tell server to abort multipart upload session and clean S3 parts
          await apiClient.post(`/files/upload/${sessionId}/abort`);
        }
      } catch (err) {
        console.error('Failed S3 upload abort request:', err);
      }
      
      delete activeUploadsRef.current[fileId];
    }
  };

  return {
    uploads,
    uploadFile,
    cancelUpload,
  };
};
