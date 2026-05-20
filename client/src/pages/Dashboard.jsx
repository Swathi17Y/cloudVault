import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderPlus, Upload, Grid, List, Search, LogOut, BarChart2, Sun, Moon, Monitor,
  Folder, File, Image, Film, Music, Archive, FileText, Trash2, Download, Share2,
  Move, MoreVertical, ChevronRight, Home, X, Loader, HardDrive, AlertCircle, Edit2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useChunkUpload } from '../hooks/useChunkUpload.js';
import apiClient from '../api/client.js';
import Analytics from '../components/Analytics.jsx';
import ShareModal from '../components/ShareModal.jsx';
import MoveModal from '../components/MoveModal.jsx';
import RenameModal from '../components/RenameModal.jsx';
import './Dashboard.css';

// ─── File Type Icon ────────────────────────────────────────────────────────────
const FileIcon = ({ mimeType, size = 20 }) => {
  const color = getFileColor(mimeType);
  if (mimeType?.startsWith('image/')) return <Image size={size} color={color} />;
  if (mimeType?.startsWith('video/')) return <Film size={size} color={color} />;
  if (mimeType?.startsWith('audio/')) return <Music size={size} color={color} />;
  if (mimeType?.includes('pdf') || mimeType?.startsWith('text/')) return <FileText size={size} color={color} />;
  if (mimeType?.includes('zip') || mimeType?.includes('archive') || mimeType?.includes('tar')) return <Archive size={size} color={color} />;
  return <File size={size} color={color} />;
};

const getFileColor = (mimeType) => {
  if (!mimeType) return 'var(--text-muted)';
  if (mimeType.startsWith('image/')) return '#06b6d4';
  if (mimeType.startsWith('video/')) return '#8b5cf6';
  if (mimeType.startsWith('audio/')) return '#f59e0b';
  if (mimeType.includes('pdf')) return '#ef4444';
  if (mimeType.startsWith('text/')) return '#10b981';
  if (mimeType.includes('zip') || mimeType.includes('tar')) return '#f97316';
  return '#94a3b8';
};

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Context Menu ──────────────────────────────────────────────────────────────
const ContextMenu = ({ x, y, item, isFolder, onClose, onDownload, onShare, onMove, onDelete, onRename }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div ref={menuRef} className="context-menu" style={{ top: y, left: x }}>
      {!isFolder && (
        <button className="context-menu-item" onClick={() => { onDownload(item); onClose(); }}>
          <Download size={14} /> Download
        </button>
      )}
      {!isFolder && (
        <button className="context-menu-item" onClick={() => { onShare(item); onClose(); }}>
          <Share2 size={14} /> Share Link
        </button>
      )}
      <button className="context-menu-item" onClick={() => { onMove(item, isFolder); onClose(); }}>
        <Move size={14} /> Move
      </button>
      <button className="context-menu-item" onClick={() => { onRename(item, isFolder); onClose(); }}>
        <Edit2 size={14} /> Rename
      </button>
      <div className="context-menu-divider" />
      <button className="context-menu-item danger" onClick={() => { onDelete(item, isFolder); onClose(); }}>
        <Trash2 size={14} /> Delete
      </button>
    </div>
  );
};

// ─── Upload Progress Panel ─────────────────────────────────────────────────────
const UploadPanel = ({ uploads, onCancel }) => {
  const activeUploads = Object.values(uploads).filter(u => !['completed', 'cancelled'].includes(u.status));
  const recentDone = Object.values(uploads).filter(u => u.status === 'completed').slice(-3);
  const allItems = [...activeUploads, ...recentDone];

  if (allItems.length === 0) return null;

  const statusColor = (status) => {
    if (status === 'completed') return '#10b981';
    if (status === 'failed') return '#ef4444';
    if (status === 'assembling') return '#f59e0b';
    return '#3b82f6';
  };

  return (
    <div className="upload-panel glass">
      <div className="upload-panel-header">
        <span className="upload-panel-title">
          <Upload size={14} /> Uploads ({activeUploads.length} active)
        </span>
      </div>
      <div className="upload-panel-list">
        {allItems.map((upload) => (
          <div key={upload.id} className="upload-item">
            <div className="upload-item-top">
              <span className="upload-filename">{upload.filename}</span>
              {!['completed', 'failed', 'cancelled'].includes(upload.status) && (
                <button className="upload-cancel-btn" onClick={() => onCancel(upload.id)} title="Cancel">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="upload-progress-bar-bg">
              <div
                className="upload-progress-bar-fill"
                style={{
                  width: `${upload.progress || 0}%`,
                  backgroundColor: statusColor(upload.status),
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div className="upload-item-meta">
              <span style={{ color: statusColor(upload.status), textTransform: 'capitalize' }}>
                {upload.status === 'assembling' ? '⚙️ Assembling...' : upload.status}
              </span>
              <span>{upload.progress || 0}%</span>
              {upload.speed && upload.speed !== 'Done' && (
                <span>{upload.speed} · ETA: {upload.eta}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard({ theme, setTheme }) {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { uploads, uploadFile, cancelUpload } = useChunkUpload();

  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [currentFolder, setCurrentFolder] = useState(null); // null = root
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: 'My Drive' }]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [createFolderMode, setCreateFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [notification, setNotification] = useState(null);
  const [sidebarFolders, setSidebarFolders] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const showNotif = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // ── Fetch Folder Contents ──
  const fetchContents = useCallback(async (folderId, pageNum = 1, append = false) => {
    try {
      setLoading(!append);
      const folderParam = folderId ? `/${folderId}` : '';
      const [folderRes, fileRes] = await Promise.all([
        apiClient.get(`/folders${folderParam}`),
        apiClient.get('/files', { params: { folder: folderId || 'root', page: pageNum, limit: 30, search: searchQuery } }),
      ]);

      const newFolders = folderRes.data?.subfolders || [];
      const newFiles = fileRes.data?.files || [];
      const total = fileRes.data?.total || 0;

      setFolders(newFolders);
      setFiles(append ? prev => [...prev, ...newFiles] : newFiles);
      setHasMore((append ? files.length + newFiles.length : newFiles.length) < total);
    } catch (err) {
      console.error('Failed to load folder contents:', err);
      showNotif('Failed to load files', 'error');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    setFiles([]);
    fetchContents(currentFolder, 1, false);
    fetchSidebarFolders();
  }, [currentFolder, searchQuery]);

  const fetchSidebarFolders = async () => {
    try {
      const res = await apiClient.get('/folders/');
      setSidebarFolders(res.data?.subfolders || []);
    } catch (e) { /* silent */ }
  };

  // ── Navigate to Folder ──
  const navigateToFolder = (folder) => {
    setCurrentFolder(folder._id);
    setBreadcrumbs(prev => [...prev, { id: folder._id, name: folder.name }]);
  };

  const navigateBreadcrumb = (crumb, index) => {
    setCurrentFolder(crumb.id);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
  };

  // ── Create Folder ──
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await apiClient.post('/folders', { name: newFolderName.trim(), parentId: currentFolder });
      setNewFolderName('');
      setCreateFolderMode(false);
      fetchContents(currentFolder);
      fetchSidebarFolders();
      showNotif(`Folder "${newFolderName}" created`, 'success');
    } catch (err) {
      showNotif(err.response?.data?.message || 'Failed to create folder', 'error');
    }
  };

  // ── File Upload Trigger ──
  const handleFileSelect = async (fileList) => {
    const filesToUpload = Array.from(fileList);
    for (const file of filesToUpload) {
      await uploadFile(file, currentFolder);
    }
    // Refresh after a short delay to let assembly queue fire
    setTimeout(() => {
      fetchContents(currentFolder);
      refreshUser();
    }, 3000);
  };

  // ── Drag & Drop ──
  const handleDragOver = (e) => { e.preventDefault(); dropZoneRef.current?.classList.add('drag-over'); };
  const handleDragLeave = () => dropZoneRef.current?.classList.remove('drag-over');
  const handleDrop = (e) => {
    e.preventDefault();
    dropZoneRef.current?.classList.remove('drag-over');
    handleFileSelect(e.dataTransfer.files);
  };

  // ── Download File ──
  const handleDownload = async (file) => {
    try {
      const res = await apiClient.get(`/files/${file._id}/download`);
      const downloadUrl = res.data.downloadUrl || res.data.url;
      if (!downloadUrl) throw new Error('No URL returned');
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      console.error(err);
      showNotif('Failed to generate download link', 'error');
    }
  };

  // ── Delete ──
  const handleDelete = async (item, isFolder) => {
    const name = item.name;
    try {
      if (isFolder) {
        await apiClient.delete(`/folders/${item._id}`);
      } else {
        await apiClient.delete(`/files/${item._id}`);
      }
      fetchContents(currentFolder);
      refreshUser();
      showNotif(`"${name}" deleted`, 'success');
    } catch {
      showNotif('Failed to delete item', 'error');
    }
  };

  // ── Context Menu ──
  const handleContextMenu = (e, item, isFolder) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item, isFolder });
  };

  // ── Logout ──
  const handleLogout = () => { logout(); navigate('/login'); };

  // ── Infinite Scroll ──
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 150 && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchContents(currentFolder, nextPage, true);
    }
  };

  // ── Storage Meter ──
  const storagePercent = user ? Math.min((user.storageUsed / user.storageLimit) * 100, 100) : 0;
  const storageColor = storagePercent > 85 ? '#ef4444' : storagePercent > 60 ? '#f59e0b' : '#3b82f6';

  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="dashboard">
      {/* ── Sidebar ── */}
      <aside className="sidebar glass">
        <div className="sidebar-logo">
          <span className="logo-icon">☁️</span>
          <span className="logo-text">CloudVault</span>
        </div>

        {/* Theme Toggle */}
        <div className="theme-toggle-row">
          {[
            { value: 'light', icon: <Sun size={14} />, label: 'Light' },
            { value: 'dark', icon: <Moon size={14} />, label: 'Dark' },
            { value: 'system', icon: <Monitor size={14} />, label: 'Auto' },
          ].map(t => (
            <button
              key={t.value}
              className={`theme-btn ${theme === t.value ? 'active' : ''}`}
              onClick={() => setTheme(t.value)}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* Sidebar Nav */}
        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${currentFolder === null && !showAnalytics ? 'active' : ''}`}
            onClick={() => { setCurrentFolder(null); setBreadcrumbs([{ id: null, name: 'My Drive' }]); setShowAnalytics(false); }}
          >
            <Home size={16} /> My Drive
          </button>
          {sidebarFolders.map(f => (
            <button
              key={f._id}
              className={`sidebar-nav-item indent ${currentFolder === f._id ? 'active' : ''}`}
              onClick={() => { navigateToFolder(f); setShowAnalytics(false); }}
            >
              <Folder size={14} /> {f.name}
            </button>
          ))}
          <button
            className={`sidebar-nav-item ${showAnalytics ? 'active' : ''}`}
            onClick={() => setShowAnalytics(prev => !prev)}
          >
            <BarChart2 size={16} /> Analytics
          </button>
        </nav>

        {/* Storage Meter */}
        <div className="storage-meter">
          <div className="storage-meter-header">
            <HardDrive size={14} />
            <span>Storage</span>
          </div>
          <div className="storage-bar-bg">
            <div className="storage-bar-fill" style={{ width: `${storagePercent}%`, backgroundColor: storageColor }} />
          </div>
          <div className="storage-meter-labels">
            <span>{formatBytes(user?.storageUsed || 0)}</span>
            <span>{formatBytes(user?.storageLimit || 1073741824)}</span>
          </div>
        </div>

        {/* User + Logout */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <div className="user-info">
              <span className="user-name">{user?.username}</span>
              <span className="user-email">{user?.email}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content" onScroll={handleScroll}>
        {showAnalytics ? (
          <Analytics />
        ) : (
          <>
            {/* Toolbar */}
            <div className="toolbar">
              {/* Breadcrumbs */}
              <div className="breadcrumbs">
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id || 'root'}>
                    <button
                      className={`breadcrumb-item ${idx === breadcrumbs.length - 1 ? 'active' : ''}`}
                      onClick={() => navigateBreadcrumb(crumb, idx)}
                    >
                      {crumb.name}
                    </button>
                    {idx < breadcrumbs.length - 1 && <ChevronRight size={14} className="breadcrumb-sep" />}
                  </React.Fragment>
                ))}
              </div>

              <div className="toolbar-right">
                {/* Search */}
                <div className="search-bar">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="search-clear">
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Create Folder */}
                {createFolderMode ? (
                  <div className="create-folder-inline">
                    <input
                      autoFocus
                      type="text"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      className="input"
                      style={{ width: '160px', padding: '0.4rem 0.7rem' }}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setCreateFolderMode(false); }}
                    />
                    <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem' }} onClick={handleCreateFolder}>Create</button>
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} onClick={() => setCreateFolderMode(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-secondary" onClick={() => setCreateFolderMode(true)}>
                    <FolderPlus size={14} /> New Folder
                  </button>
                )}

                {/* Upload */}
                <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={14} /> Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => handleFileSelect(e.target.files)}
                />

                {/* View Mode */}
                <div className="view-toggle">
                  <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}><Grid size={14} /></button>
                  <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={14} /></button>
                </div>
              </div>
            </div>

            {/* Drop Zone + File Explorer */}
            <div
              ref={dropZoneRef}
              className={`file-explorer ${viewMode}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {loading && files.length === 0 ? (
                <div className="skeleton-grid">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="skeleton-card" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Empty state */}
                  {filteredFolders.length === 0 && filteredFiles.length === 0 && !loading && (
                    <div className="empty-state">
                      <div className="empty-icon">📁</div>
                      <h3>This folder is empty</h3>
                      <p>Drag files here or click Upload to get started</p>
                    </div>
                  )}

                  {/* Folders */}
                  {filteredFolders.length > 0 && (
                    <div className="section-label">Folders ({filteredFolders.length})</div>
                  )}
                  <div className={`items-grid ${viewMode}`}>
                    {filteredFolders.map(folder => (
                      <div
                        key={folder._id}
                        className="file-item folder-item"
                        onDoubleClick={() => navigateToFolder(folder)}
                        onContextMenu={e => handleContextMenu(e, folder, true)}
                      >
                        <div className="file-item-icon">
                          <Folder size={viewMode === 'grid' ? 36 : 20} color="#f59e0b" />
                        </div>
                        <div className="file-item-info">
                          <span className="file-item-name">{folder.name}</span>
                          <span className="file-item-meta">{formatDate(folder.createdAt)}</span>
                        </div>
                        <button className="item-menu-btn" onClick={e => handleContextMenu(e, folder, true)}>
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Files */}
                  {filteredFiles.length > 0 && (
                    <div className="section-label">Files ({filteredFiles.length})</div>
                  )}
                  <div className={`items-grid ${viewMode}`}>
                    {filteredFiles.map(file => (
                      <div
                        key={file._id}
                        className="file-item"
                        onDoubleClick={() => handleDownload(file)}
                        onContextMenu={e => handleContextMenu(e, file, false)}
                      >
                        <div className="file-item-icon">
                          <FileIcon mimeType={file.mimeType} size={viewMode === 'grid' ? 36 : 20} />
                        </div>
                        <div className="file-item-info">
                          <span className="file-item-name">{file.name}</span>
                          <span className="file-item-meta">
                            {formatBytes(file.size)} · {formatDate(file.createdAt)}
                            {file.isCompressed && (
                              <span className="badge badge-green" title={`${file.compressionRatio}x compressed`}>
                                {file.compressionRatio}x
                              </span>
                            )}
                          </span>
                        </div>
                        <button className="item-menu-btn" onClick={e => handleContextMenu(e, file, false)}>
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Load more indicator */}
                  {loading && files.length > 0 && (
                    <div className="load-more">
                      <Loader size={16} className="spinner" /> Loading more...
                    </div>
                  )}

                  {/* Drag overlay hint */}
                  <div className="drop-overlay">
                    <Upload size={32} />
                    <span>Drop files to upload</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          isFolder={contextMenu.isFolder}
          onClose={() => setContextMenu(null)}
          onDownload={handleDownload}
          onShare={item => setShareTarget(item)}
          onMove={(item, isFolder) => setMoveTarget({ item, isFolder })}
          onDelete={handleDelete}
          onRename={(item, isFolder) => setRenameTarget({ item, isFolder })}
        />
      )}

      {/* ── Upload Panel ── */}
      <UploadPanel uploads={uploads} onCancel={cancelUpload} />

      {/* ── Modals ── */}
      {shareTarget && (
        <ShareModal file={shareTarget} onClose={() => setShareTarget(null)} onSuccess={() => showNotif('Share link created!', 'success')} />
      )}
      {moveTarget && (
        <MoveModal
          item={moveTarget.item}
          isFolder={moveTarget.isFolder}
          currentFolderId={currentFolder}
          onClose={() => setMoveTarget(null)}
          onSuccess={() => { fetchContents(currentFolder); showNotif('Moved successfully', 'success'); setMoveTarget(null); }}
        />
      )}
      {renameTarget && (
        <RenameModal
          item={renameTarget.item}
          isFolder={renameTarget.isFolder}
          onClose={() => setRenameTarget(null)}
          onSuccess={(newName) => {
            fetchContents(currentFolder);
            fetchSidebarFolders();
            showNotif(`Renamed to "${newName}"`, 'success');
          }}
        />
      )}

      {/* ── Notification Toast ── */}
      {notification && (
        <div className={`toast toast-${notification.type}`}>
          {notification.type === 'error' && <AlertCircle size={14} />}
          {notification.message}
        </div>
      )}
    </div>
  );
}
