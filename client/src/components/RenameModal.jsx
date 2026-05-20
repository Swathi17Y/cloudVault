import React, { useState } from 'react';
import apiClient from '../api/client.js';
import { X, Edit2, ShieldAlert } from 'lucide-react';

export default function RenameModal({ item, isFolder, onClose, onSuccess }) {
  const [name, setName] = useState(item.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRename = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (name.trim() === item.name) {
      onClose();
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isFolder) {
        await apiClient.patch(`/folders/${item._id}`, { name: name.trim() });
      } else {
        await apiClient.patch(`/files/${item._id}`, { name: name.trim() });
      }
      onSuccess(name.trim());
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Rename failed. Please try again.');
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
            <Edit2 size={20} color="var(--accent-blue)" />
            <h3 style={styles.title}>Rename {isFolder ? 'Folder' : 'File'}</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRename} style={styles.form}>
          <div className="form-group">
            <label htmlFor="rename-input" className="form-label" style={styles.label}>
              New Name
            </label>
            <input
              id="rename-input"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              style={styles.input}
              disabled={loading}
              placeholder={`Enter new ${isFolder ? 'folder' : 'file'} name`}
              required
            />
          </div>

          {/* Actions Footer */}
          <div style={styles.footer}>
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn btn-primary glow"
              style={styles.confirmBtn}
            >
              {loading ? 'Renaming...' : 'Rename'}
            </button>
          </div>
        </form>

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
    maxWidth: '400px',
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
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  label: {
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '0.5rem',
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '0.625rem 0.875rem',
    fontSize: '0.875rem',
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
