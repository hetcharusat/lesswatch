import React, { useState, useRef } from 'react';
import {
  Sparkles, ArrowRight, ArrowLeft, Shield, CheckCircle2,
  Sliders, Activity, AlertCircle, Server, Check, Lock, User,
  HeartHandshake, Film, Eye, EyeOff, Globe, DownloadCloud, Radio,
  Zap, Layers, ExternalLink, CheckCheck
} from 'lucide-react';
import DiagnosticsPanel from './DiagnosticsPanel';

export default function SetupWizard({ initialConfig, onComplete, isPreview = false, onExitPreview = null }) {
  const [step, setStep] = useState(1);
  const [instanceName, setInstanceName] = useState(initialConfig?.instanceName || 'Watch Together');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [allowPublicSignup, setAllowPublicSignup] = useState(false);
  const [quickLoginEnabled, setQuickLoginEnabled] = useState(true);
  const [quickLoginMode, setQuickLoginMode] = useState('autofill');
  const [modules, setModules] = useState({
    neko: initialConfig?.modules?.neko !== false,
    downloader: initialConfig?.modules?.downloader !== false,
    mediaStudio: initialConfig?.modules?.mediaStudio !== false,
    livekit: initialConfig?.modules?.livekit !== false
  });
  const [diagSnapshot, setDiagSnapshot] = useState(null);
  const nekoTouchedRef = useRef(false);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleDiagnosticsLoaded = (data) => {
    setDiagSnapshot(data);
    if (!nekoTouchedRef.current && data?.neko && !data.neko.capable) {
      setModules(m => (m.neko ? { ...m, neko: false } : m));
    }
  };

  const validateStep1 = () => {
    if (!instanceName.trim()) return 'Instance name is required.';
    return '';
  };

  const validateStep3 = () => {
    if (!adminName.trim()) return 'Admin display name is required.';
    if (!adminEmail.trim()) return 'Admin username or email is required.';
    if (!adminPassword || adminPassword.length < 4) return 'Password must be at least 4 characters.';
    if (adminPassword !== confirmPassword) return 'Passwords do not match.';
    return '';
  };

  const goToStep = (targetStep) => {
    setError('');
    if (targetStep > step) {
      if (step === 1) {
        const err = validateStep1();
        if (err) { setError(err); return; }
      } else if (step === 3 && targetStep > 3) {
        const err = validateStep3();
        if (err) { setError(err); return; }
      }
    }
    setStep(targetStep);
  };

  const handleNext = () => {
    goToStep(Math.min(5, step + 1));
  };

  const handleBack = () => {
    setError('');
    setStep(s => Math.max(1, s - 1));
  };

  const handleFinish = async (e) => {
    if (e) e.preventDefault();
    setError('');

    const step1Err = validateStep1();
    if (step1Err) { setError(step1Err); setStep(1); return; }

    const step3Err = validateStep3();
    if (step3Err) { setError(step3Err); setStep(3); return; }

    if (isPreview) {
      if (onExitPreview) onExitPreview();
      else if (onComplete) onComplete('preview-token', { role: 'admin', name: adminName || 'Admin' }, initialConfig);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: instanceName.trim(),
          adminName: adminName.trim(),
          adminEmail: adminEmail.trim(),
          adminPassword,
          allowPublicSignup,
          quickLoginEnabled,
          quickLoginMode,
          modules
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete setup');
      onComplete(data.token, data.user, data.config);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getPasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: '', color: '#fce7f3' };
    if (pass.length < 4) return { score: 25, label: 'Too short (min 4)', color: '#f87171' };
    if (pass.length < 7) return { score: 50, label: 'Fair strength', color: '#fbbf24' };
    const hasMixed = /[A-Z]/.test(pass) && /[0-9]/.test(pass);
    if (pass.length >= 8 && hasMixed) return { score: 100, label: 'Strong & secure', color: '#10b981' };
    return { score: 75, label: 'Good', color: '#34d399' };
  };

  const passStrength = getPasswordStrength(adminPassword);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === adminPassword;

  const stepList = [
    { id: 1, label: 'Welcome', icon: Sparkles },
    { id: 2, label: 'Health Check', icon: Activity },
    { id: 3, label: 'Admin Account', icon: Shield },
    { id: 4, label: 'Modules & Policies', icon: Sliders },
    { id: 5, label: 'Ready!', icon: CheckCircle2 }
  ];

  return (
    <div className="setup-flow-backdrop">
      <div className="setup-flow-card">
        {/* Preview Banner */}
        {isPreview && (
          <div className="setup-flow-preview-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} />
              <span><strong>Setup Wizard Live Preview</strong> — Safe testing sandbox</span>
            </div>
            {onExitPreview && (
              <button
                type="button"
                onClick={onExitPreview}
                className="setup-flow-btn-secondary"
                style={{ padding: '4px 12px', fontSize: '0.78rem' }}
              >
                Exit Preview
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="setup-flow-header">
          <div className="setup-flow-brand">
            <div className="setup-flow-logo-box">
              <Film size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 className="setup-flow-title">{instanceName || 'Watch Together'}</h1>
                <span className="setup-flow-chip" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                  Self-Hosted
                </span>
              </div>
              <p className="setup-flow-subtitle">
                Step {step} of 5 — {stepList[step - 1]?.label}
              </p>
            </div>
          </div>

          {/* Stepper pills */}
          <div className="setup-flow-stepper">
            {stepList.map(({ id, label, icon: Icon }) => {
              const active = step === id;
              const done = step > id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (id < step) goToStep(id);
                  }}
                  className={`setup-flow-step-btn ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                  title={id < step ? `Return to Step ${id}` : label}
                >
                  <span className="setup-flow-step-num">{done ? '✓' : id}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Morphing Progress Track */}
        <div className="setup-flow-progress-track">
          <div
            className="setup-flow-progress-fill"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="setup-flow-alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Welcome & Server Identity */}
        {step === 1 && (
          <div key={1} className="setup-flow-body setup-flow-step-enter">
            <div className="setup-flow-hero">
              <div className="setup-flow-hero-icon">
                <HeartHandshake size={32} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: '#831843' }}>
                Welcome to your self-hosted cinema
              </h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#78345c', maxWidth: 520, lineHeight: 1.5 }}>
                Sync videos, voice chat, and watch together with friends across the globe in sub-second precision.
                Let's configure your server instance in under 2 minutes.
              </p>
            </div>

            <div className="setup-flow-feature-box">
              <label className="setup-flow-label" htmlFor="wt-instance-name">
                <Server size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
                Instance / Server Name
              </label>
              <input
                id="wt-instance-name"
                type="text"
                className="setup-flow-input"
                value={instanceName}
                onChange={e => {
                  setError('');
                  setInstanceName(e.target.value);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleNext();
                }}
                placeholder="e.g. Midnight Cinema, Watch Together"
                autoFocus
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 }}>
                <span style={{ fontSize: '0.78rem', color: '#9d174d', fontWeight: 600 }}>
                  This title appears on lobby headers, browser bookmarks, and room invite links.
                </span>
                <span className="setup-flow-chip" style={{ fontSize: '0.7rem' }}>
                  {instanceName.trim().length || 0} chars
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              <div className="setup-flow-highlight-card">
                <div className="setup-flow-highlight-icon">
                  <Zap size={18} />
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#831843' }}>
                  Sub-Second Sync
                </div>
                <div style={{ fontSize: '0.78rem', color: '#78345c', lineHeight: 1.45 }}>
                  Continuous NTP drift compensation ensures everyone stays on the exact same video frame.
                </div>
              </div>

              <div className="setup-flow-highlight-card">
                <div className="setup-flow-highlight-icon">
                  <Radio size={18} />
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#831843' }}>
                  Low-Latency SFU
                </div>
                <div style={{ fontSize: '0.78rem', color: '#78345c', lineHeight: 1.45 }}>
                  Built-in LiveKit audio & camera channels with spatial ducking and echo cancellation.
                </div>
              </div>

              <div className="setup-flow-highlight-card">
                <div className="setup-flow-highlight-icon">
                  <Layers size={18} />
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#831843' }}>
                  Multi-Source Studio
                </div>
                <div style={{ fontSize: '0.78rem', color: '#78345c', lineHeight: 1.45 }}>
                  Stream torrents directly, paste YouTube/anime links, or play local MP4/MKV video files.
                </div>
              </div>
            </div>

            <div className="setup-flow-actions">
              <div />
              <button
                type="button"
                onClick={handleNext}
                className="setup-flow-btn-primary"
              >
                Begin Automated Check <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Automated Health Diagnostics */}
        {step === 2 && (
          <div key={2} className="setup-flow-body setup-flow-step-enter">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#831843' }}>
                  System & Network Diagnostics
                </h2>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#78345c' }}>
                  Verifying local media toolchains (FFmpeg, yt-dlp, aria2c), container capability, and WebSocket connectivity.
                </p>
              </div>

              <span className="setup-flow-chip success">
                Automated Verification
              </span>
            </div>

            <DiagnosticsPanel
              isSetupMode
              nekoEnabled={modules.neko}
              onToggleNeko={(val) => {
                nekoTouchedRef.current = true;
                setModules(m => ({ ...m, neko: val }));
              }}
              onDiagnosticsLoaded={handleDiagnosticsLoaded}
            />

            <div className="setup-flow-actions">
              <button
                type="button"
                onClick={handleBack}
                className="setup-flow-btn-secondary"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="setup-flow-btn-primary"
              >
                Continue to Admin Account <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Admin Account */}
        {step === 3 && (
          <div key={3} className="setup-flow-body setup-flow-step-enter">
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#831843' }}>
                Create Master Administrator
              </h2>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#78345c' }}>
                This root account owns instance configuration, room management, and user permissions.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div>
                <label className="setup-flow-label">
                  <User size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -2 }} />
                  Admin Display Name
                </label>
                <input
                  type="text"
                  className="setup-flow-input"
                  value={adminName}
                  onChange={e => {
                    setError('');
                    setAdminName(e.target.value);
                  }}
                  placeholder="e.g. Captain, Alex, CinemaMaster"
                  autoFocus
                />
              </div>

              <div>
                <label className="setup-flow-label">
                  <User size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -2 }} />
                  Admin Login (Email or Username)
                </label>
                <input
                  type="text"
                  className="setup-flow-input"
                  value={adminEmail}
                  onChange={e => {
                    setError('');
                    setAdminEmail(e.target.value);
                  }}
                  placeholder="admin@example.com or admin"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div>
                <label className="setup-flow-label">
                  <Lock size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -2 }} />
                  Admin Password (min 4 chars)
                </label>
                <div className="setup-flow-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="setup-flow-input"
                    value={adminPassword}
                    onChange={e => {
                      setError('');
                      setAdminPassword(e.target.value);
                    }}
                    placeholder="Create master password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="setup-flow-input-adornment"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {adminPassword && (
                  <div style={{ marginTop: 6 }}>
                    <div className="setup-flow-strength-track">
                      <div
                        className="setup-flow-strength-fill"
                        style={{ width: `${passStrength.score}%`, backgroundColor: passStrength.color }}
                      />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#78345c', fontWeight: 600 }}>
                      {passStrength.label}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="setup-flow-label">
                  <Lock size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -2 }} />
                  Confirm Password
                </label>
                <div className="setup-flow-input-wrap">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="setup-flow-input"
                    value={confirmPassword}
                    onChange={e => {
                      setError('');
                      setConfirmPassword(e.target.value);
                    }}
                    placeholder="Repeat password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    className="setup-flow-input-adornment"
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {confirmPassword && (
                  <div style={{ marginTop: 6 }}>
                    {passwordsMatch ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', color: '#047857', fontWeight: 700 }}>
                        <CheckCheck size={13} /> Passwords match
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.74rem', color: '#be123c', fontWeight: 600 }}>
                        Passwords do not match yet
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fff6fa', border: '1px solid rgba(244, 114, 182, 0.25)', fontSize: '0.8rem', color: '#78345c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} style={{ color: '#ec4899', flexShrink: 0 }} />
              <span>Passwords are cryptographically salted and hashed using bcrypt on your local server database.</span>
            </div>

            <div className="setup-flow-actions">
              <button
                type="button"
                onClick={handleBack}
                className="setup-flow-btn-secondary"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="setup-flow-btn-primary"
              >
                Continue to Modules <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Modules & Policies */}
        {step === 4 && (
          <div key={4} className="setup-flow-body setup-flow-step-enter">
                          <div>
                            <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#831843' }}>
                              Access Policies & Feature Modules
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.84rem', color: '#78345c' }}>
                              Tailor authentication rules and toggle optional features for your server.
                            </p>
                          </div>

                          {/* Login & Account Policies */}
                          <div className="setup-flow-feature-box">
                            <div style={{ fontWeight: 800, color: '#831843', fontSize: '0.92rem' }}>
                              Login & Authentication Policies
                            </div>

                            <div
                              className="setup-flow-module-tile"
                              onClick={() => setAllowPublicSignup(v => !v)}
                            >
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#831843' }}>
                                  Allow Public User Sign-Ups
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#78345c', marginTop: 2 }}>
                                  When disabled (recommended for private/home setups), only administrators can invite or register new users.
                                </div>
                              </div>
                              <div className={`setup-flow-switch ${allowPublicSignup ? 'is-on' : ''}`}>
                                <div className="setup-flow-switch-thumb" />
                              </div>
                            </div>

                            <div
                              className="setup-flow-module-tile"
                              onClick={() => setQuickLoginEnabled(v => !v)}
                            >
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#831843' }}>
                                  Show Quick-Login Profile Cards
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#78345c', marginTop: 2 }}>
                                  Displays household / friend avatar pills on the login screen for instant 1-tap switching.
                                </div>
                              </div>
                              <div className={`setup-flow-switch ${quickLoginEnabled ? 'is-on' : ''}`}>
                                <div className="setup-flow-switch-thumb" />
                              </div>
                            </div>

                            {quickLoginEnabled && (
                              <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fff0f6', border: '1px solid rgba(244, 114, 182, 0.3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#9d174d' }}>Quick-Login Mode:</span>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#831843', cursor: 'pointer' }}>
                                  <input
                                    type="radio"
                                    name="quickLoginMode"
                                    checked={quickLoginMode === 'autofill'}
                                    onChange={() => setQuickLoginMode('autofill')}
                                    style={{ accentColor: '#ec4899' }}
                                  />
                                  <span><strong>Autofill + Password Required</strong> (secure — fills username, asks for password)</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#831843', cursor: 'pointer' }}>
                                  <input
                                    type="radio"
                                    name="quickLoginMode"
                                    checked={quickLoginMode === 'passwordless'}
                                    onChange={() => setQuickLoginMode('passwordless')}
                                    style={{ accentColor: '#ec4899' }}
                                  />
                                  <span><strong>1-Click Passwordless</strong> (trusted home LAN only)</span>
                                </label>
                              </div>
                            )}
                          </div>

                          {/* Feature Modules */}
                          <div className="setup-flow-feature-box">
                            <div style={{ fontWeight: 800, color: '#831843', fontSize: '0.92rem' }}>
                              Feature Modules
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                              {[
                                {
                                  key: 'downloader',
                                  icon: DownloadCloud,
                                  title: 'Downloader (aria2 & yt-dlp)',
                                  desc: 'Stream torrent magnets directly and extract YouTube/anime streams.'
                                },
                                {
                                  key: 'mediaStudio',
                                  icon: Film,
                                  title: 'Media Studio',
                                  desc: 'In-browser video transcoding, audio normalizer, and subtitle extraction.'
                                },
                                {
                                  key: 'livekit',
                                  icon: Radio,
                                  title: 'LiveKit Voice & Cam SFU',
                                  desc: 'Low-latency crystal clear voice chat and webcam video tiles.'
                                },
                                {
                                  key: 'neko',
                                  icon: Globe,
                                  title: 'Shared Browser (Neko)',
                                  desc: diagSnapshot?.neko && !diagSnapshot.neko.capable
                                    ? 'Unavailable on this host (Docker container required); disabled by default.'
                                    : 'Synchronized virtual Chromium browser inside rooms.'
                                }
                              ].map(({ key, icon: Icon, title, desc }) => (
                                <div
                                  key={key}
                                  onClick={() => {
                                    if (key === 'neko') nekoTouchedRef.current = true;
                                    setModules(m => ({ ...m, [key]: !m[key] }));
                                  }}
                                  className={`setup-flow-module-tile ${modules[key] ? 'is-active' : ''}`}
                                >
                                  <div style={{ display: 'flex', gap: 10 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fce7f3', color: '#db2777', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                                      <Icon size={16} />
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#831843' }}>
                                        {title}
                                      </div>
                                      <div style={{ fontSize: '0.76rem', color: '#78345c', marginTop: 2, lineHeight: 1.35 }}>
                                        {desc}
                                      </div>
                                    </div>
                                  </div>
                                  <div className={`setup-flow-switch ${modules[key] ? 'is-on' : ''}`}>
                                    <div className="setup-flow-switch-thumb" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

            <div className="setup-flow-actions">
              <button
                type="button"
                onClick={handleBack}
                className="setup-flow-btn-secondary"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="setup-flow-btn-primary"
              >
                Review & Launch <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Ready to Launch */}
        {step === 5 && (
          <div key={5} className="setup-flow-body setup-flow-step-enter">
            <div className="setup-flow-hero">
              <div className="setup-flow-hero-icon celebrate">
                <Check size={34} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: '#831843' }}>
                All Set and Ready!
              </h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#78345c', maxWidth: 480, lineHeight: 1.5 }}>
                Your server configuration is verified and complete. Review your settings below and launch your instance.
              </p>
            </div>

            {/* Summary card */}
            <div className="setup-flow-summary-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#831843' }}>Instance Name</span>
                <span className="setup-flow-chip success">{instanceName}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#831843' }}>Master Administrator</span>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#3b142d' }}>
                  {adminName || 'Admin'} <span style={{ color: '#9d174d' }}>({adminEmail || 'admin@local'})</span>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#831843' }}>Access Policies</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="setup-flow-chip">
                    {allowPublicSignup ? 'Public Signup On' : 'Private / Admin Only'}
                  </span>
                  <span className="setup-flow-chip">
                    {quickLoginEnabled ? `Quick-Login (${quickLoginMode})` : 'Quick-Login Off'}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 800, color: '#831843', marginBottom: 8 }}>
                  Active Feature Modules
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {modules.downloader && <span className="setup-flow-chip success">✓ Downloader (aria2 & yt-dlp)</span>}
                  {modules.mediaStudio && <span className="setup-flow-chip success">✓ Media Studio</span>}
                  {modules.livekit && <span className="setup-flow-chip success">✓ LiveKit Voice SFU</span>}
                  {modules.neko && <span className="setup-flow-chip success">✓ Shared Browser (Neko)</span>}
                  {!modules.downloader && !modules.mediaStudio && !modules.livekit && !modules.neko && (
                    <span style={{ fontSize: '0.8rem', color: '#9d174d' }}>Core Player Only</span>
                  )}
                </div>
              </div>
            </div>

            <div className="setup-flow-actions">
              <button
                type="button"
                onClick={handleBack}
                className="setup-flow-btn-secondary"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={submitting}
                className="setup-flow-btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  boxShadow: '0 4px 16px -2px rgba(16, 185, 129, 0.4)'
                }}
              >
                {submitting ? (
                  <>Saving Configuration...</>
                ) : isPreview ? (
                  <>Exit Preview & Enter Watch Together <Sparkles size={16} /></>
                ) : (
                  <>Complete Setup & Launch Cinema <ArrowRight size={16} /></>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
