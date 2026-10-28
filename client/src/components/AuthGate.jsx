import React, { useState } from 'react';
import { Sparkles, Heart, Shield, Lock, Mail, User, ArrowRight, CheckCircle2 } from 'lucide-react';
import { UserAvatar } from './JojoAvatar';

export function AuthGate({ onAuthenticated }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Quick select helper for Het & Riaa
  function handleQuickSelect(selectedEmail, selectedPass) {
    setEmail(selectedEmail);
    setPassword(selectedPass);
    setError('');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
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
      onAuthenticated(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify both entries!');
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
      onAuthenticated(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      {/* Decorative Floating Sparkles Background */}
      <div className="auth-bg-decorations" aria-hidden="true">
        <span className="auth-floating-dot dot-1">🌸</span>
        <span className="auth-floating-dot dot-2">✨</span>
        <span className="auth-floating-dot dot-3">🍿</span>
        <span className="auth-floating-dot dot-4">💖</span>
        <span className="auth-floating-dot dot-5">🎀</span>
      </div>

      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-header">
          <div className="auth-logo-badge">
            <span style={{ fontSize: '1.9rem' }}>🍿</span>
          </div>
          <h1 className="auth-title">Watch Together</h1>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tab-container">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            Sign In ✨
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
          >
            Create Account 🌸
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="auth-error-box">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Quick One-Click Profile Cards */}
        {tab === 'login' && (
          <div className="auth-quick-select-section">
            <div className="auth-quick-select-label">
              ⚡ Quick 1-Click Access:
            </div>
            <div className="auth-quick-buttons-row">
              <button
                type="button"
                onClick={() => handleQuickSelect('het@watchtogether.local', '1234')}
                className={`auth-profile-card profile-het ${email === 'het@watchtogether.local' ? 'selected' : ''}`}
              >
                <UserAvatar user={{ name: 'Het', avatar: 'jotaro' }} size={40} showBorder={true} />
                <div className="auth-profile-info">
                  <span className="auth-profile-name">Het</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect('riaa@watchtogether.local', '1234')}
                className={`auth-profile-card profile-riaa ${email === 'riaa@watchtogether.local' ? 'selected' : ''}`}
              >
                <UserAvatar user={{ name: 'Riaa', avatar: 'jolyne' }} size={40} showBorder={true} />
                <div className="auth-profile-info">
                  <span className="auth-profile-name">Riaa</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="auth-form">
          {tab === 'register' && (
            <div className="auth-field-group">
              <label className="auth-label">Your Name</label>
              <div className="auth-input-wrapper">
                <User size={16} className="auth-field-icon" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Het or Riaa"
                  className="auth-input"
                />
              </div>
            </div>
          )}

          <div className="auth-field-group">
            <label className="auth-label">Email Address</label>
            <div className="auth-input-wrapper">
              <Mail size={16} className="auth-field-icon" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@watchtogether.local"
                className="auth-input"
              />
            </div>
          </div>

          <div className="auth-field-group">
            <label className="auth-label">Password</label>
            <div className="auth-input-wrapper">
              <Lock size={16} className="auth-field-icon" />
              <input
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
