import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Lock, Mail, User, ArrowRight, CheckCircle2, Zap } from 'lucide-react';
import { UserAvatar } from './JojoAvatar';

export function AuthGate({ appConfig: initialAppConfig = null, onAuthenticated }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const [bootstrap, setBootstrap] = useState(() => ({
    instanceName: initialAppConfig?.instanceName || 'Watch Together',
    allowPublicSignup: !!initialAppConfig?.allowPublicSignup,
    quickLoginEnabled: initialAppConfig?.quickLoginEnabled !== false,
    quickLoginMode: initialAppConfig?.quickLoginMode === 'passwordless' ? 'passwordless' : 'autofill',
    quickLoginUsers: []
  }));

  const passwordInputRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/auth/bootstrap')
      .then(res => res.json())
      .then(data => {
        if (!isMounted || !data) return;
        setBootstrap({
          instanceName: data.instanceName || 'Watch Together',
          allowPublicSignup: !!data.allowPublicSignup,
          quickLoginEnabled: data.quickLoginEnabled !== false,
          quickLoginMode: data.quickLoginMode === 'passwordless' ? 'passwordless' : 'autofill',
          quickLoginUsers: Array.isArray(data.quickLoginUsers) ? data.quickLoginUsers : []
        });
        if (!data.allowPublicSignup) {
          setTab('login');
        }
      })
      .catch((err) => console.warn('Could not load auth bootstrap config:', err));
    return () => { isMounted = false; };
  }, [initialAppConfig]);

  async function handleQuickCardClick(profile) {
    setError('');
    setInfoMsg('');
    if (bootstrap.quickLoginMode === 'passwordless') {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/quick-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: profile.id })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Quick-Login failed.');
        }
        localStorage.setItem('wt_token', data.token);
        localStorage.setItem('wt_user', JSON.stringify(data.user));
        onAuthenticated(data.user, data.token);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      setEmail(profile.email);
      setPassword('');
      setInfoMsg(`Selected ${profile.name}. Enter your password to sign in.`);
      setTimeout(() => passwordInputRef.current?.focus(), 30);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Login failed. Please check your credentials.');
      }

      localStorage.setItem('wt_token', data.token);
      localStorage.setItem('wt_user', JSON.stringify(data.user));
      onAuthenticated(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setInfoMsg('');

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify both entries.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          confirmPassword
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed.');
      }

      localStorage.setItem('wt_token', data.token);
      localStorage.setItem('wt_user', JSON.stringify(data.user));
      onAuthenticated(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const showQuickCards = tab === 'login' && bootstrap.quickLoginEnabled && bootstrap.quickLoginUsers.length > 0;

  return (
    <div className="auth-wrapper">
      <div className="auth-bg-decorations" aria-hidden="true">
        <span className="auth-floating-dot dot-1">🌸</span>
        <span className="auth-floating-dot dot-2">✨</span>
        <span className="auth-floating-dot dot-3">🍿</span>
        <span className="auth-floating-dot dot-4">💖</span>
        <span className="auth-floating-dot dot-5">🎀</span>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-badge">
            <span style={{ fontSize: '1.9rem' }}>🍿</span>
          </div>
          <h1 className="auth-title">{bootstrap.instanceName || 'Watch Together'}</h1>
        </div>

        {/* Tab Switcher (Sign Up shown only if public signup enabled by Admin) */}
        {bootstrap.allowPublicSignup ? (
          <div className="auth-tab-container">
            <button
              type="button"
              className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setError(''); setInfoMsg(''); }}
            >
              Sign In ✨
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setError(''); setInfoMsg(''); }}
            >
              Create Account 🌸
            </button>
          </div>
        ) : null}

        {error && (
          <div className="auth-error-box">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {infoMsg && !error && (
          <div style={{
            padding: '8px 12px', borderRadius: 10, marginBottom: 12,
            background: 'rgba(244,114,182,0.14)', border: '1px solid rgba(244,114,182,0.35)',
            color: '#fbcfe8', fontSize: 12.5, textAlign: 'center'
          }}>
            {infoMsg}
          </div>
        )}

        {/* Dynamic Quick-Login Profile Cards */}
        {showQuickCards && (
          <div className="auth-quick-select-section">
            <div className="auth-quick-select-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <Zap size={13} />
              {bootstrap.quickLoginMode === 'passwordless'
                ? 'Quick 1-Click Sign In:'
                : 'Select Profile (Password Required):'}
            </div>
            <div className="auth-quick-buttons-row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              {bootstrap.quickLoginUsers.map(u => {
                const isSelected = email.trim().toLowerCase() === u.email?.toLowerCase();
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickCardClick(u)}
                    className={`auth-profile-card ${isSelected ? 'selected' : ''}`}
                    style={{ borderColor: isSelected ? (u.color || '#f472b6') : undefined }}
                  >
                    <UserAvatar user={u} size={40} showBorder={true} />
                    <div className="auth-profile-info">
                      <span className="auth-profile-name">{u.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="auth-form">
          {tab === 'register' && (
            <div className="auth-field-group">
              <label className="auth-label">Display Name</label>
              <div className="auth-input-wrapper">
                <User size={16} className="auth-field-icon" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your display name"
                  className="auth-input"
                />
              </div>
            </div>
          )}

          <div className="auth-field-group">
            <label className="auth-label">{tab === 'login' ? 'Email or Username' : 'Email Address'}</label>
            <div className="auth-input-wrapper">
              <Mail size={16} className="auth-field-icon" />
              <input
                type={tab === 'login' ? 'text' : 'email'}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tab === 'login' ? 'user@example.com or username' : 'you@example.com'}
                className="auth-input"
              />
            </div>
          </div>

          <div className="auth-field-group">
            <label className="auth-label">Password</label>
            <div className="auth-input-wrapper">
              <Lock size={16} className="auth-field-icon" />
              <input
                ref={passwordInputRef}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-input"
              />
            </div>
          </div>

          {tab === 'register' && (
            <div className="auth-field-group">
              <label className="auth-label">Confirm Password</label>
              <div className="auth-input-wrapper">
                <CheckCircle2 size={16} className="auth-field-icon" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="auth-input"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-gold-shimmer auth-submit-btn"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : tab === 'login' ? (
              <>
                <span>Sign In to Theater ✨</span>
                <ArrowRight size={17} />
              </>
            ) : (
              <>
                <span>Create Account & Enter 🌸</span>
                <Sparkles size={17} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
