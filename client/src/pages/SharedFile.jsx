import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../api/client.js';
import { 
  Cloud, Download, Eye, File, FileText, Image, Video, Music, 
  Lock, AlertTriangle, Calendar, TrendingUp, Sun, Moon, Monitor,
  Clock, ShieldAlert, CheckCircle, RefreshCw
} from 'lucide-react';

export default function SharedFile({ theme, setTheme }) {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // State for password challenge
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // File details state
  const [fileDetails, setFileDetails] = useState(null);
  const [accessUrl, setAccessUrl] = useState('');
  const [accessType, setAccessType] = useState('download');
  const [downloadCount, setDownloadCount] = useState(0);
  const [maxDownloads, setMaxDownloads] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);

  // Helper to format bytes
  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Helper to get file icon by mimetype
  const getFileIcon = (mimeType) => {
    if (!mimeType) return <File size={48} color="var(--accent-blue)" />;
    const mime = mimeType.toLowerCase();
    if (mime.startsWith('image/')) return <Image size={48} color="var(--accent-cyan)" />;
    if (mime.startsWith('video/')) return <Video size={48} color="var(--accent-amber)" />;
    if (mime.startsWith('audio/')) return <Music size={48} color="var(--accent-green)" />;
    if (mime.startsWith('text/') || mime.includes('pdf') || mime.includes('document')) {
      return <FileText size={48} color="var(--accent-blue)" />;
    }
    return <File size={48} color="var(--text-muted)" />;
  };

  const fetchSharedFile = async (pwdInput = '') => {
    setLoading(true);
    setError('');
    setPasswordError('');

    try {
      const headers = {};
      if (pwdInput) {
        headers['x-share-password'] = pwdInput;
      }

      const response = await apiClient.get(`/share/access/${token}`, { headers });
      
      const { file, url, accessType: type, downloadCount: count, maxDownloads: max, expiresAt: exp } = response.data;
      setFileDetails(file);
      setAccessUrl(url);
      setAccessType(type);
      setDownloadCount(count);
      setMaxDownloads(max);
      setExpiresAt(exp);
      setPasswordRequired(false);
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 401 && data?.passwordRequired) {
        setPasswordRequired(true);
        if (pwdInput) {
          setPasswordError('Invalid password. Please try again.');
        }
      } else {
        setError(data?.message || 'The shared link is invalid, has expired, or exceeded download limits.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSharedFile();
    }
  }, [token]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!password) {
      setPasswordError('Please enter a password');
      return;
    }
    fetchSharedFile(password);
  };

  const handleActionClick = () => {
    if (!accessUrl) return;
    
    // Redirect or open link
    if (accessType === 'view') {
      window.open(accessUrl, '_blank');
    } else {
      // Create temporary download element for files
      const link = document.createElement('a');
      link.href = accessUrl;
      link.setAttribute('download', fileDetails?.name || 'download');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Increment count locally so UI updates instantly
      setDownloadCount(prev => prev + 1);
    }
  };

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
  const isLimitReached = maxDownloads !== null && downloadCount >= maxDownloads;

  return (
    <div style={styles.container}>
      {/* Background visuals */}
      <div style={styles.glow1} />
      <div style={styles.glow2} />

      {/* Theme selector */}
      <div style={styles.themeBar} className="glass">
        <button 
          onClick={() => setTheme('light')} 
          style={{ ...styles.themeBtn, color: theme === 'light' ? 'var(--accent-blue)' : 'var(--text-secondary)' }}
          title="Light Theme"
        >
          <Sun size={18} />
        </button>
        <button 
          onClick={() => setTheme('dark')} 
          style={{ ...styles.themeBtn, color: theme === 'dark' ? 'var(--accent-blue)' : 'var(--text-secondary)' }}
          title="Dark Theme"
        >
          <Moon size={18} />
        </button>
        <button 
          onClick={() => setTheme('system')} 
          style={{ ...styles.themeBtn, color: theme === 'system' ? 'var(--accent-blue)' : 'var(--text-secondary)' }}
          title="System Default"
        >
          <Monitor size={18} />
        </button>
      </div>

      <div style={styles.cardContainer} className="glass card glow">
        {/* Top Logo */}
        <div style={styles.logoHeader}>
          <div style={styles.miniLogo}>
            <Cloud size={24} color="var(--accent-blue)" />
          </div>
          <span style={styles.brandName}>CloudVault Share</span>
        </div>

        {/* 1. Loading State */}
        {loading && (
          <div style={styles.loadingWrapper}>
            <RefreshCw size={36} color="var(--accent-blue)" style={styles.spin} />
            <p style={styles.loadingText}>Fetching secure link details...</p>
          </div>
        )}

        {/* 2. Error / Expiration State */}
        {!loading && error && (
          <div style={styles.errorState}>
            <ShieldAlert size={64} color="var(--accent-red)" style={{ marginBottom: '1rem' }} />
            <h3 style={styles.errorTitle}>Link Unavailable</h3>
            <p style={styles.errorDescription}>{error}</p>
            <div style={styles.specifications} className="glass">
              <div style={styles.specRow}>
                <AlertTriangle size={16} color="var(--accent-amber)" />
                <span style={styles.specVal}>Make sure the link token is correct or ask the owner to re-share the file.</span>
              </div>
            </div>
          </div>
        )}

        {/* 3. Password Challenge State */}
        {!loading && !error && passwordRequired && (
          <div style={styles.passwordState}>
            <div style={styles.lockBadge}>
              <Lock size={32} color="var(--accent-blue)" />
            </div>
            <h3 style={styles.passwordTitle}>Password Protected</h3>
            <p style={styles.passwordSub}>The owner has locked this file. Please enter the password to gain access.</p>
            
            <form onSubmit={handlePasswordSubmit} style={styles.passwordForm}>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input"
                style={styles.passwordInput}
                autoFocus
              />
              {passwordError && (
                <p style={styles.passwordErrorText}>{passwordError}</p>
              )}
              <button 
                type="submit" 
                className="btn btn-primary glow" 
                style={styles.passwordSubmitBtn}
              >
                Access File
              </button>
            </form>
          </div>
        )}

        {/* 4. Active Shared File Download State */}
        {!loading && !error && !passwordRequired && fileDetails && (
          <div style={styles.fileState}>
            <div style={styles.fileIconBox}>
              {getFileIcon(fileDetails.mimeType)}
            </div>

            <h2 style={styles.fileName}>{fileDetails.name}</h2>
            <span style={styles.fileSize}>{formatBytes(fileDetails.size)}</span>

            {/* Validation Warnings */}
            {isExpired && (
              <div style={styles.warningBox}>
                <Clock size={16} />
                <span>This shared link has expired. Download might fail.</span>
              </div>
            )}
            {isLimitReached && (
              <div style={styles.warningBox}>
                <AlertTriangle size={16} />
                <span>Download limit reached ({maxDownloads} max).</span>
              </div>
            )}

            {/* Detailed File Specs */}
            <div style={styles.specifications} className="glass">
              <div style={styles.specRow}>
                <span style={styles.specKey}>File Type:</span>
                <span style={styles.specVal}>{fileDetails.mimeType || 'Unknown'}</span>
              </div>
              
              <div style={styles.specRow}>
                <span style={styles.specKey}>Downloads:</span>
                <span style={{ ...styles.specVal, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <TrendingUp size={14} color="var(--accent-green)" />
                  {downloadCount} {maxDownloads ? `/ ${maxDownloads} max` : ''}
                </span>
              </div>

              {expiresAt && (
                <div style={styles.specRow}>
                  <span style={styles.specKey}>Expires:</span>
                  <span style={{ ...styles.specVal, color: isExpired ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                    <Calendar size={14} style={{ marginRight: '0.25rem' }} />
                    {new Date(expiresAt).toLocaleDateString()} {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>

            {/* Main Action Button */}
            <button
              onClick={handleActionClick}
              disabled={isExpired || isLimitReached}
              className="btn btn-primary glow"
              style={styles.actionButton}
            >
              {accessType === 'view' ? (
                <>
                  <Eye size={20} style={{ marginRight: '0.5rem' }} />
                  View File
                </>
              ) : (
                <>
                  <Download size={20} style={{ marginRight: '0.5rem' }} />
                  Download File
                </>
              )}
            </button>

            <div style={styles.successNote}>
              <CheckCircle size={14} color="var(--accent-green)" />
              <span>Link verified secure by CloudVault</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    width: '100vw',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
    padding: '1.5rem',
  },
  glow1: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(0,0,0,0) 70%)',
    top: '15%',
    left: '15%',
    zIndex: 0,
    pointerEvents: 'none',
  },
  glow2: {
    position: 'absolute',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(0,0,0,0) 70%)',
    bottom: '15%',
    right: '15%',
    zIndex: 0,
    pointerEvents: 'none',
  },
  themeBar: {
    position: 'absolute',
    top: '1.5rem',
    right: '1.5rem',
    display: 'flex',
    gap: '0.25rem',
    padding: '0.375rem',
    borderRadius: 'var(--border-radius-md)',
    zIndex: 10,
  },
  themeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: 'var(--border-radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color var(--transition-speed) var(--transition-easing)',
  },
  cardContainer: {
    width: '100%',
    maxWidth: '480px',
    padding: '2.5rem',
    zIndex: 1,
    boxShadow: 'var(--box-shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    textAlign: 'center',
  },
  logoHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  miniLogo: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border-color)',
  },
  brandName: {
    fontSize: '0.875rem',
    fontWeight: '700',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  loadingWrapper: {
    padding: '3rem 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
  },
  loadingText: {
    fontSize: '0.9375rem',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  spin: {
    animation: 'spin 1.2s linear infinite',
  },
  errorState: {
    padding: '1.5rem 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '0.5rem',
  },
  errorDescription: {
    fontSize: '0.875rem',
    color: 'var(--text-secondary)',
    lineHeight: '1.5',
    marginBottom: '1.5rem',
  },
  passwordState: {
    padding: '1rem 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  lockBadge: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1rem',
    boxShadow: '0 8px 24px rgba(59, 130, 246, 0.1)',
  },
  passwordTitle: {
    fontSize: '1.25rem',
    fontWeight: '700',
    marginBottom: '0.5rem',
  },
  passwordSub: {
    fontSize: '0.875rem',
    color: 'var(--text-secondary)',
    marginBottom: '1.5rem',
    lineHeight: '1.4',
  },
  passwordForm: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  passwordInput: {
    textAlign: 'center',
    letterSpacing: '0.1em',
  },
  passwordErrorText: {
    fontSize: '0.8125rem',
    color: 'var(--accent-red)',
    marginTop: '-0.5rem',
  },
  passwordSubmitBtn: {
    height: '2.75rem',
    width: '100%',
  },
  fileState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  fileIconBox: {
    width: '96px',
    height: '96px',
    borderRadius: '24px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.25rem',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.05)',
  },
  fileName: {
    fontSize: '1.375rem',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '0.25rem',
    lineHeight: '1.3',
    wordBreak: 'break-all',
    padding: '0 0.5rem',
  },
  fileSize: {
    fontSize: '0.9375rem',
    color: 'var(--text-muted)',
    fontWeight: '500',
    marginBottom: '1.5rem',
  },
  warningBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    color: 'var(--accent-amber)',
    padding: '0.75rem 1rem',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '0.8125rem',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '1.25rem',
    textAlign: 'left',
  },
  specifications: {
    width: '100%',
    borderRadius: 'var(--border-radius-md)',
    padding: '1rem',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '2rem',
    boxSizing: 'border-box',
  },
  specRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.875rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.75rem',
    ':lastChild': {
      borderBottom: 'none',
      paddingBottom: 0,
    }
  },
  specKey: {
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  specVal: {
    color: 'var(--text-secondary)',
    fontWeight: '600',
  },
  actionButton: {
    width: '100%',
    height: '3.25rem',
    fontSize: '1rem',
    borderRadius: 'var(--border-radius-md)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: '600',
    marginBottom: '1.25rem',
  },
  successNote: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--text-muted)',
  }
};
