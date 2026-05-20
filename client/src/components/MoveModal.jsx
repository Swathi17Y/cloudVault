import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';
import { X, Folder, FolderPlus, ArrowLeft, Move, ShieldAlert, ChevronRight } from 'lucide-react';

export default function MoveModal({ item, itemType, onClose, onSuccess }) {
  const [currentFolderId, setCurrentFolderId] = useState(null); // null means root
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch folders at the current directory level
  const fetchFolders = async (folderId) => {
    setLoading(true);
    setError('');
    try {
      const url = folderId ? `/folders/${folderId}` : '/folders';
      const response = await apiClient.get(url);
      
      const { folders: subfolders, folder } = response.data.data;
      
      // Filter out self if we are moving a folder (can't move a folder into itself)
      const filteredSubfolders = itemType === 'folder' 
        ? subfolders.filter(f => f._id !== item._id)
        : subfolders;

      setFolders(filteredSubfolders);

      // Reconstruct breadcrumbs from the materialized path or folder object if exists
      if (folder) {
        // Build breadcrumbs path
        // Materialized paths are stored as '/parentID/childID/'
        // A simple way is to use the backend's current folder structure
        setBreadcrumbs(prev => {
          // If already in breadcrumbs, slice up to it
          const idx = prev.findIndex(b => b.id === folder._id);
          if (idx !== -1) {
            return prev.slice(0, idx + 1);
          }
          // Otherwise append
          return [...prev, { id: folder._id, name: folder.name }];
        });
      } else {
        setBreadcrumbs([]);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch directory structure.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders(currentFolderId);
  }, [currentFolderId]);

  const handleNavigate = (folderId) => {
    setCurrentFolderId(folderId);
  };

  const handleBack = () => {
    if (breadcrumbs.length === 0) return;
    if (breadcrumbs.length === 1) {
      setCurrentFolderId(null);
    } else {
      setCurrentFolderId(breadcrumbs[breadcrumbs.length - 2].id);
    }
  };

  const handleMove = async () => {
    // Validate target (can't move folder to its own subfolders)
    if (itemType === 'folder') {
      if (currentFolderId === item._id) {
        setError('Cannot move a folder into itself.');
        return;
      }
      // Check if current destination is a descendant of the folder being moved
      // (This is guarded on backend, but good to check client-side too)
    }

    setLoading(true);
    setError('');

    try {
      if (itemType === 'file') {
        await apiClient.patch(`/files/${item._id}/move`, {
          folderId: currentFolderId || 'root',
        });
      } else {
        await apiClient.patch(`/folders/${item._id}/move`, {
          parent: currentFolderId || 'root',
        });
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Move operation failed. Verify destination.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="glass card glow">
        
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <Move size={20} color="var(--accent-blue)" />
            <h3 style={styles.title}>Move {itemType === 'file' ? 'File' : 'Folder'}</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        <p style={styles.intro}>
          Select destination for <strong>{item.name}</strong>:
        </p>

        {error && (
          <div style={styles.errorBox}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Browser Panel */}
        <div style={styles.browser} className="glass">
          {/* Browser Toolbar (Breadcrumbs / Back button) */}
          <div style={styles.browserBar}>
            <button
              onClick={handleBack}
              disabled={currentFolderId === null || loading}
              style={styles.backBtn}
              className="btn"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            <div style={styles.path}>
              <span 
                onClick={() => !loading && setCurrentFolderId(null)}
                style={{ ...styles.pathSegment, fontWeight: currentFolderId === null ? '600' : '400' }}
              >
                Root
              </span>
              {breadcrumbs.map((crumb, idx) => (
                <span key={crumb.id} style={styles.pathRow}>
                  <ChevronRight size={12} color="var(--text-muted)" />
                  <span 
                    onClick={() => !loading && setCurrentFolderId(crumb.id)}
                    style={{ ...styles.pathSegment, fontWeight: idx === breadcrumbs.length - 1 ? '600' : '400' }}
                  >
                    {crumb.name}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Directory Folder List */}
          <div style={styles.folderList}>
            {loading ? (
              <div style={styles.loadingState}>
                <div style={styles.spinner} />
              </div>
            ) : folders.length > 0 ? (
              folders.map(folder => (
                <div
                  key={folder._id}
                  onClick={() => handleNavigate(folder._id)}
                  style={styles.folderItem}
                  className="glass"
                >
                  <Folder size={18} color="var(--accent-blue)" />
                  <span style={styles.folderName}>{folder.name}</span>
                </div>
              ))
            ) : (
              <div style={styles.emptyState}>
                <FolderPlus size={32} color="var(--text-muted)" style={{ marginBottom: '0.5rem' }} />
                <span>No subfolders in this location</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} className="btn btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={loading}
            className="btn btn-primary glow"
            style={styles.confirmBtn}
          >
            Move Here
          </button>
        </div>

      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '1rem',
  },
  modal: {
    width: '100%',
    maxWidth: '460px',
    borderWidth: '1px',
    borderStyle: 'solid',
    boxShadow: 'var(--box-shadow-lg)',
    padding: '1.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  title: {
    fontSize: '1.125rem',
    fontWeight: '700',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
  },
  intro: {
    fontSize: '0.875rem',
    color: 'var(--text-secondary)',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: 'var(--accent-red)',
    padding: '0.75rem',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '0.8125rem',
  },
  browser: {
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-md)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    height: '240px',
  },
  browserBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
  },
  backBtn: {
    padding: '0.375rem 0.625rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.75rem',
    borderRadius: 'var(--border-radius-sm)',
  },
  path: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.8125rem',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    flexGrow: 1,
    scrollbarWidth: 'none', // hide for scroll
    '::-webkit-scrollbar': {
      display: 'none',
    }
  },
  pathRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  pathSegment: {
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    ':hover': {
      color: 'var(--text-primary)',
      textDecoration: 'underline',
    }
  },
  folderList: {
    flexGrow: 1,
    overflowY: 'auto',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  folderItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.625rem 0.875rem',
    borderRadius: 'var(--border-radius-sm)',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-speed) ease',
    ':hover': {
      backgroundColor: 'var(--bg-hover)',
    }
  },
  folderName: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--text-primary)',
  },
  loadingState: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2.5px solid var(--border-color)',
    borderTopColor: 'var(--accent-blue)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '0.8125rem',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  confirmBtn: {
    padding: '0.5rem 1.25rem',
  }
};
