import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';
import { 
  BarChart2, HardDrive, Share2, Shield, Calendar, Layers, 
  TrendingUp, FileText, Image as ImageIcon, Film, Archive, HelpCircle, AlertCircle
} from 'lucide-react';

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Analytics Data
  const [storageData, setStorageData] = useState(null);
  const [uploadActivity, setUploadActivity] = useState([]);
  const [fileTypes, setFileTypes] = useState(null);
  const [dedupSavings, setDedupSavings] = useState(null);

  // Load data on mount
  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      setError('');
      try {
        const [storageRes, uploadsRes, fileTypesRes, dedupRes] = await Promise.all([
          apiClient.get('/analytics/storage'),
          apiClient.get('/analytics/uploads'),
          apiClient.get('/analytics/file-types'),
          apiClient.get('/analytics/dedup-savings')
        ]);
        
        setStorageData(storageRes.data.data);
        setUploadActivity(uploadsRes.data.data);
        setFileTypes(fileTypesRes.data.data);
        setDedupSavings(dedupRes.data.data);
      } catch (err) {
        console.error('Failed fetching analytics:', err);
        setError('Error loading analytics data. Please make sure you are logged in.');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  // Format Helper
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Compiling storage insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer} className="glass">
        <AlertCircle size={40} color="var(--accent-red)" />
        <h4 style={{ margin: '0.75rem 0 0.25rem', fontWeight: 600 }}>Analytics Load Failure</h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{error}</p>
      </div>
    );
  }

  // Pre-process timeline data for SVG Area chart
  // Fill in dates if activity is sparse, or default to mock if empty
  const timelinePoints = uploadActivity.length > 0 ? uploadActivity : Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    return { _id: d.toISOString().split('T')[0], count: 0, totalSize: 0 };
  });

  const maxTimelineCount = Math.max(...timelinePoints.map(p => p.count), 5);
  
  // Calculate SVG dimensions for the area chart
  const svgWidth = 500;
  const svgHeight = 150;
  const paddingX = 40;
  const paddingY = 20;
  const chartWidth = svgWidth - paddingX * 2;
  const chartHeight = svgHeight - paddingY * 2;
  
  // Plotting points
  const points = timelinePoints.map((point, index) => {
    const x = paddingX + (index / (timelinePoints.length - 1)) * chartWidth;
    const y = paddingY + chartHeight - (point.count / maxTimelineCount) * chartHeight;
    return { x, y, label: point._id.substring(5), count: point.count };
  });

  const pathD = points.length > 0 
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${paddingY + chartHeight} L ${points[0].x} ${paddingY + chartHeight} Z`
    : '';

  // Storage doughnut calculation
  const percentage = storageData ? storageData.percentageUsed : 0;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // File type categorizations
  const fileTypeCategories = [
    { key: 'image', label: 'Images', icon: <ImageIcon size={16} />, color: 'var(--accent-cyan)' },
    { key: 'media', label: 'Audio & Video', icon: <Film size={16} />, color: 'var(--accent-amber)' },
    { key: 'document', label: 'Documents', icon: <FileText size={16} />, color: 'var(--accent-blue)' },
    { key: 'archive', label: 'Archives', icon: <Archive size={16} />, color: 'var(--accent-green)' },
    { key: 'other', label: 'Others', icon: <HelpCircle size={16} />, color: 'var(--text-muted)' }
  ];

  const totalFiles = fileTypes ? Object.values(fileTypes).reduce((sum, item) => sum + item.count, 0) : 0;

  return (
    <div style={styles.grid}>
      
      {/* 1. Storage Quota circular meter */}
      <div style={styles.chartCard} className="glass card glow">
        <div style={styles.cardHeader}>
          <HardDrive size={18} color="var(--accent-blue)" />
          <h3 style={styles.cardTitle}>Storage Allocation</h3>
        </div>
        <div style={styles.doughnutWrapper}>
          <svg width="150" height="150" style={{ transform: 'rotate(-90deg)' }}>
            {/* Background Circle */}
            <circle
              cx="75"
              cy="75"
              r={radius}
              stroke="var(--bg-hover)"
              strokeWidth="10"
              fill="transparent"
            />
            {/* Active Circle with glow */}
            <circle
              cx="75"
              cy="75"
              r={radius}
              stroke="var(--accent-blue)"
              strokeWidth="10"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          <div style={styles.doughnutCenter}>
            <span style={styles.doughnutPct}>{percentage}%</span>
            <span style={styles.doughnutSub}>Used</span>
          </div>
        </div>
        
        {/* Usage specs */}
        {storageData && (
          <div style={styles.statsList}>
            <div style={styles.statsRow}>
              <span style={styles.statsDot} />
              <span style={styles.statsLabel}>Total Space Used:</span>
              <span style={styles.statsVal}>{formatBytes(storageData.storageUsed)}</span>
            </div>
            <div style={styles.statsRow}>
              <span style={{ ...styles.statsDot, backgroundColor: 'var(--text-muted)' }} />
              <span style={styles.statsLabel}>Available Limit:</span>
              <span style={styles.statsVal}>{formatBytes(storageData.storageLimit)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Upload timelines SVG Area chart */}
      <div style={styles.chartCard} className="glass card glow">
        <div style={styles.cardHeader}>
          <BarChart2 size={18} color="var(--accent-cyan)" />
          <h3 style={styles.cardTitle}>Upload Activity (Last 30 Days)</h3>
        </div>
        
        <div style={styles.timelineWrapper}>
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%">
            {/* Horizontal Grid lines */}
            {Array.from({ length: 4 }).map((_, i) => {
              const yVal = paddingY + (i / 3) * chartHeight;
              const countVal = Math.round(maxTimelineCount - (i / 3) * maxTimelineCount);
              return (
                <g key={i}>
                  <line
                    x1={paddingX}
                    y1={yVal}
                    x2={svgWidth - paddingX}
                    y2={yVal}
                    stroke="var(--border-color)"
                    strokeWidth="0.5"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingX - 10}
                    y={yVal + 4}
                    fill="var(--text-muted)"
                    fontSize="9px"
                    textAnchor="end"
                  >
                    {countVal}
                  </text>
                </g>
              );
            })}

            {/* Sparkline Area path */}
            {points.length > 0 && (
              <>
                <path
                  d={areaD}
                  fill="url(#area-gradient)"
                  opacity="0.2"
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke="var(--accent-cyan)"
                  strokeWidth="2.5"
                />
                
                {/* Dots on points */}
                {points.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={p.x}
                    cy={p.y}
                    r={p.count > 0 ? "4" : "1.5"}
                    fill={p.count > 0 ? "var(--accent-cyan)" : "var(--border-color)"}
                    stroke="var(--bg-primary)"
                    strokeWidth={p.count > 0 ? "1.5" : "0.5"}
                  />
                ))}
              </>
            )}

            {/* X-axis Labels */}
            {points.map((p, idx) => {
              // Only render alternate labels to prevent overlap
              if (points.length > 8 && idx % 2 !== 0) return null;
              return (
                <text
                  key={idx}
                  x={p.x}
                  y={svgHeight - 4}
                  fill="var(--text-muted)"
                  fontSize="8px"
                  textAnchor="middle"
                >
                  {p.label}
                </text>
              );
            })}

            {/* Gradients */}
            <defs>
              <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-cyan)" />
                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        
        <p style={styles.chartFootnote}>
          Total items uploaded in recent days. Highlighted dots indicate active upload sessions.
        </p>
      </div>

      {/* 3. File distribution list */}
      <div style={styles.chartCard} className="glass card glow">
        <div style={styles.cardHeader}>
          <Layers size={18} color="var(--accent-green)" />
          <h3 style={styles.cardTitle}>Format Distribution</h3>
        </div>

        <div style={styles.distributionWrapper}>
          {fileTypes ? (
            fileTypeCategories.map(({ key, label, icon, color }) => {
              const count = fileTypes[key]?.count || 0;
              const size = fileTypes[key]?.totalSize || 0;
              const pct = totalFiles > 0 ? Math.round((count / totalFiles) * 100) : 0;
              
              return (
                <div key={key} style={styles.distItem}>
                  <div style={styles.distHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color }}>{icon}</span>
                      <span style={styles.distLabel}>{label}</span>
                    </div>
                    <span style={styles.distCount}>{count} files ({formatBytes(size, 1)})</span>
                  </div>
                  
                  <div style={styles.barContainer}>
                    <div 
                      style={{ 
                        ...styles.barFill, 
                        backgroundColor: color, 
                        width: `${pct}%`,
                        boxShadow: `0 0 10px ${color}40` 
                      }} 
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No files found in storage.</p>
          )}
        </div>
      </div>

      {/* 4. Deduplication Savings */}
      <div style={styles.chartCard} className="glass card glow">
        <div style={styles.cardHeader}>
          <Shield size={18} color="var(--accent-amber)" />
          <h3 style={styles.cardTitle}>S3 Storage Deduplication Savings</h3>
        </div>

        {dedupSavings ? (
          <div style={styles.dedupContainer}>
            <div style={styles.savingsBox}>
              <div style={styles.savingsGlow} />
              <div style={styles.savingsGrid}>
                <div>
                  <span style={styles.savingsBigText}>
                    {formatBytes(dedupSavings.userLevel.savingsBytes + dedupSavings.systemLevel.savingsBytes)}
                  </span>
                  <p style={styles.savingsLabelSub}>Total Saved Storage Space</p>
                </div>
                <div style={styles.savingsBadge}>
                  <TrendingUp size={16} />
                  <span>Cost Optimized</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={styles.dedupCard} className="glass">
                <div style={styles.dedupLabelRow}>
                  <span style={styles.dedupCardTitle}>User-Level Duplicates</span>
                  <span style={styles.dedupCardVal}>{dedupSavings.userLevel.duplicateCount} files</span>
                </div>
                <p style={styles.dedupCardDesc}>
                  Saved <strong>{formatBytes(dedupSavings.userLevel.savingsBytes)}</strong> by linking identical files uploaded to different folders to the same physical object.
                </p>
              </div>

              <div style={styles.dedupCard} className="glass">
                <div style={styles.dedupLabelRow}>
                  <span style={styles.dedupCardTitle}>Cross-User/System duplicates</span>
                  <span style={styles.dedupCardVal}>{dedupSavings.systemLevel.duplicateCount} files</span>
                </div>
                <p style={styles.dedupCardDesc}>
                  Saved <strong>{formatBytes(dedupSavings.systemLevel.savingsBytes)}</strong> by sharing S3 blocks globally when identical files exist on other user vaults.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Deduplication index is processing...</p>
        )}
      </div>

    </div>
  );
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1.25rem',
    width: '100%',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '4rem 0',
    width: '100%',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid var(--border-color)',
    borderTopColor: 'var(--accent-blue)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorContainer: {
    padding: '2rem',
    borderRadius: 'var(--border-radius-md)',
    textAlign: 'center',
    borderWidth: '1px',
    borderStyle: 'solid',
  },
  chartCard: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '260px',
    borderWidth: '1px',
    borderStyle: 'solid',
    boxShadow: 'var(--box-shadow-md)',
    padding: '1.25rem',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    marginBottom: '1rem',
  },
  cardTitle: {
    fontSize: '0.9375rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  doughnutWrapper: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0.5rem 0',
  },
  doughnutCenter: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  doughnutPct: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  doughnutSub: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: '0.05em',
  },
  statsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginTop: '1rem',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.8125rem',
  },
  statsDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-blue)',
    marginRight: '0.5rem',
  },
  statsLabel: {
    color: 'var(--text-secondary)',
    flexGrow: 1,
  },
  statsVal: {
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  timelineWrapper: {
    height: '130px',
    display: 'flex',
    alignItems: 'flex-end',
    width: '100%',
  },
  chartFootnote: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    lineHeight: '1.3',
    marginTop: '0.75rem',
  },
  distributionWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  distItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  distHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8125rem',
  },
  distLabel: {
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  distCount: {
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  barContainer: {
    height: '6px',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: '3px',
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.8s ease',
  },
  dedupContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  savingsBox: {
    position: 'relative',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    border: '1px dashed rgba(245, 158, 11, 0.25)',
    borderRadius: 'var(--border-radius-md)',
    padding: '1rem',
    overflow: 'hidden',
  },
  savingsGlow: {
    position: 'absolute',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: 'rgba(245, 158, 11, 0.15)',
    filter: 'blur(20px)',
    top: '-10px',
    right: '-10px',
  },
  savingsGrid: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savingsBigText: {
    fontSize: '1.625rem',
    fontWeight: '800',
    color: 'var(--accent-amber)',
    letterSpacing: '-0.02em',
  },
  savingsLabelSub: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    marginTop: '0.125rem',
  },
  savingsBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    color: 'var(--accent-green)',
    borderRadius: '20px',
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontWeight: '600',
  },
  dedupCard: {
    padding: '0.75rem',
    borderRadius: 'var(--border-radius-sm)',
    borderWidth: '1px',
    borderStyle: 'solid',
  },
  dedupLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  dedupCardTitle: {
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  dedupCardVal: {
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: 'var(--text-muted)',
  },
  dedupCardDesc: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  }
};
