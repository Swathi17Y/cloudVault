import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Sun, Moon, Monitor, Eye, EyeOff, Lock, Mail, User, Cloud, AlertCircle, ArrowRight } from 'lucide-react';

export default function Register({ theme, setTheme }) {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await register(username, email, password);
      if (res.success) {
        navigate('/');
      } else {
        setError(res.message || 'Registration failed. Try a different username/email.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Background visual effects */}
      <div style={styles.glow1} />
      <div style={styles.glow2} />

      {/* Theme Selection Toolbar */}
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
        {/* Header/Logo */}
        <div style={styles.header}>
          <div style={styles.logoContainer}>
            <Cloud size={40} color="var(--accent-blue)" style={styles.logoIcon} />
            <div style={styles.logoPulse} />
          </div>
          <h2 style={styles.title}>Get started with</h2>
          <h1 style={styles.brand}>CloudVault</h1>
          <p style={styles.subtitle}>Create your secure account to start saving space instantly.</p>
        </div>

        {/* Error notification */}
        {error && (
          <div style={styles.errorAlert}>
            <AlertCircle size={18} color="var(--accent-red)" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Username</label>
            <div style={styles.inputWrapper}>
              <User size={18} style={styles.inputIcon} />
              <input
                type="text"
                placeholder="johndoe"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={styles.input}
                className="input"
                disabled={loading}
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <div style={styles.inputWrapper}>
              <Mail size={18} style={styles.inputIcon} />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={styles.input}
                className="input"
                disabled={loading}
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrapper}>
              <Lock size={18} style={styles.inputIcon} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ ...styles.input, paddingRight: '2.5rem' }}
                className="input"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                tabIndex="-1"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Confirm Password</label>
            <div style={styles.inputWrapper}>
              <Lock size={18} style={styles.inputIcon} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{ ...styles.input, paddingRight: '2.5rem' }}
                className="input"
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={styles.submitBtn}
            className="btn btn-primary glow"
          >
            {loading ? (
              <div style={styles.spinner} />
            ) : (
              <span style={styles.btnContent}>
                Create Account <ArrowRight size={18} />
              </span>
            )}
          </button>
        </form>

        <div style={styles.footer}>
          <span>Already have an account?</span>
          <Link to="/login" style={styles.link}>Sign In</Link>
        </div>
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
    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0,0,0,0) 70%)',
    top: '-10%',
    left: '10%',
    zIndex: 0,
    pointerEvents: 'none',
  },
  glow2: {
    position: 'absolute',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, rgba(0,0,0,0) 70%)',
    bottom: '-10%',
    right: '10%',
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
    transition: 'color var(--transition-speed) var(--transition-easing), background-color var(--transition-speed) var(--transition-easing)',
    ':hover': {
      backgroundColor: 'var(--bg-hover)',
    }
  },
  cardContainer: {
    width: '100%',
    maxWidth: '440px',
    padding: '2.5rem',
    zIndex: 1,
    boxShadow: 'var(--box-shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  logoContainer: {
    position: 'relative',
    width: '72px',
    height: '72px',
    borderRadius: '20px',
    backgroundColor: 'var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.25rem',
    border: '1px solid var(--border-color)',
    boxShadow: '0 8px 24px rgba(59, 130, 246, 0.1)',
  },
  logoIcon: {
    zIndex: 2,
  },
  logoPulse: {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    borderRadius: '20px',
    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(0,0,0,0) 70%)',
    animation: 'pulse 3s infinite alternate',
    zIndex: 1,
  },
  title: {
    fontSize: '1rem',
    fontWeight: '500',
    color: 'var(--text-muted)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: '0.25rem',
  },
  brand: {
    fontSize: '2.25rem',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    marginBottom: '0.75rem',
    background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--accent-blue) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.875rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--accent-red)',
    fontSize: '0.875rem',
    lineHeight: '1.4',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    letterSpacing: '0.01em',
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
    paddingLeft: '2.75rem',
  },
  eyeBtn: {
    position: 'absolute',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ':hover': {
      color: 'var(--text-primary)',
    }
  },
  submitBtn: {
    marginTop: '0.5rem',
    height: '2.875rem',
    fontSize: '0.9375rem',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--text-secondary)',
    marginTop: '0.5rem',
  },
  link: {
    color: 'var(--accent-blue)',
    textDecoration: 'none',
    fontWeight: '600',
    ':hover': {
      textDecoration: 'underline',
    }
  }
};
