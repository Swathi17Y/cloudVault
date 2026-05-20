import React, { useState } from 'react';
import apiClient from '../api/client.js';
import { X, Copy, Check, Lock, Calendar, Download, Eye, Link as LinkIcon, AlertCircle } from 'lucide-react';

export default function ShareModal({ file, onClose }) {
  const [password, setPassword] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [accessType, setAccessType] = useState('download');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sharedLink, setSharedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/share', {
        fileId: file._id,
        password: password || undefined,
        expiresInHours: expiresInHours ? parseInt(expiresInHours, 10) : undefined,
        maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : undefined,
        accessType
      });

      const { token } = response.data.data;
      const shareUrl = `${window.location.origin}/s/${token}`;
      setSharedLink(shareUrl);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to create share link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!sharedLink) return;
    navigator.clipboard.writeText(sharedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="glass card glow">
        
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <LinkIcon size={20} color="var(--accent-blue)" />
            <h3 style={styles.title}>Share "{file.name}"</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="Close">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Share settings Form */}
        {!sharedLink ? (
          <form onSubmit={handleSubmit} style={styles.form}>
            
            {/* Access Type Choice */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>Access Mode</label>
              <div style={styles.accessOptions}>
                <button
                  type="button"
                  onClick={() => setAccessType('download')}
                  style={{
                    ...styles.optionBtn,
                    borderColor: accessType === 'download' ? 'var(--accent-blue)' : 'var(--border-color)',
                    backgroundColor: accessType === 'download' ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                    color: accessType === 'download' ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                >
                  <Download size={16} color="var(--accent-blue)" />
                  <div style={{ textAlign: 'left' }}>
                    <div style={styles.optionTitle}>Download Link</div>
                    <div style={styles.optionDesc}>Recipients can download the file.</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAccessType('view')}
                  style={{
                    ...styles.optionBtn,
                    borderColor: accessType === 'view' ? 'var(--accent-blue)' : 'var(--border-color)',
                    backgroundColor: accessType === 'view' ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                    color: accessType === 'view' ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                >
                  <Eye size={16} color="var(--accent-cyan)" />
                  <div style={{ textAlign: 'left' }}>
                    <div style={styles.optionTitle}>View Only</div>
                    <div style={styles.optionDesc}>Recipients view inside browser.</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Optional Password Protection */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>Password (Optional)</label>
              <div style={styles.inputWrapper}>
                <Lock size={16} style={styles.inputIcon} />
                <input
                  type="password"
                  placeholder="Set a password to download"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  className="input"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Expiry and Limit Double Row */}
            <div style={styles.row}>
              <div style={{ ...styles.inputGroup, flex: 1 }}>
                <label style={styles.label}>Expires In (Hours)</label>
                <div style={styles.inputWrapper}>
                  <Calendar size={16} style={styles.inputIcon} />
                  <input
                    type="number"
                    min="1"
                    placeholder="Never"
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(e.target.value)}
                    style={styles.input}
                    className="input"
                    disabled={loading}
                  />
                </div>
              </div>

              <div style={{ ...styles.inputGroup, flex: 1 }}>
                <label style={styles.label}>Max Downloads</label>
                <div style={styles.inputWrapper}>
                  <Download size={16} style={styles.inputIcon} />
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={maxDownloads}
                    onChange={(e) => setMaxDownloads(e.target.value)}
                    style={styles.input}
                    className="input"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary glow"
              style={styles.actionBtn}
            >
              {loading ? 'Creating...' : 'Create Secure Link'}
            </button>
          </form>
        ) : (
          /* 2. Success Shared Link Screen */
          <div style={styles.successScreen}>
            <p style={styles.successText}>Secure link created successfully!</p>
            <div style={styles.linkRow}>
              <input
                type="text"
                readOnly
                value={sharedLink}
                style={styles.linkInput}
                className="input"
                onClick={handleCopy}
              />
              <button 
                onClick={handleCopy} 
                className="btn btn-primary" 
                style={styles.copyBtn}
                title="Copy Link"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            
            <p style={styles.copyNotice}>
              {copied ? 'Copied link to clipboard!' : 'Click inside or copy to share.'}
            </p>

            <button 
              onClick={onClose} 
              className="btn btn-secondary" 
              style={styles.closeModalBtn}
            >
              Done
            </button>
          </div>
        )}
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
    maxWidth: '500px',
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
    ':hover': {
      color: 'var(--text-primary)',
    }
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
    gap: '1rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  label: {
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
  accessOptions: {
    display: 'flex',
    gap: '0.75rem',
    width: '100%',
  },
  optionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: 'var(--border-radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-speed) var(--transition-easing)',
  },
  optionTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    marginTop: '0.125rem',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '1rem',
    color: 'var(--text-muted)',
    pointerEvents: 'none',
  },
  input: {
    paddingLeft: '2.5rem',
  },
  row: {
    display: 'flex',
    gap: '1rem',
  },
  actionBtn: {
    height: '2.75rem',
    fontWeight: '600',
    marginTop: '0.5rem',
  },
  successScreen: {
    textAlign: 'center',
    padding: '0.5rem 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  },
  successText: {
    fontSize: '1rem',
    fontWeight: '600',
    color: 'var(--accent-green)',
  },
  linkRow: {
    display: 'flex',
    gap: '0.5rem',
    width: '100%',
  },
  linkInput: {
    flexGrow: 1,
    cursor: 'pointer',
    textAlign: 'center',
  },
  copyBtn: {
    padding: '0 1rem',
  },
  copyNotice: {
    fontSize: '0.8125rem',
    color: 'var(--text-muted)',
  },
  closeModalBtn: {
    width: '120px',
    marginTop: '0.5rem',
  }
};
