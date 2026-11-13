import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Users, Settings, Activity, KeyRound, Eye, EyeOff, Copy, Check,
  UserPlus, Trash2, LogOut, Edit3, Save, X, ArrowLeft, AlertCircle
} from 'lucide-react';
import DiagnosticsPanel from './DiagnosticsPanel';
import { JojoAvatar } from './JojoAvatar';

export default function AdminPanel({ authToken, currentUser, appConfig, onConfigUpdated, onNavigate }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState({ type: '', text: '' });

  // Settings state
  const [settings, setSettings] = useState({
    instanceName: appConfig?.instanceName || 'Watch Together',
    allowPublicSignup: !!appConfig?.allowPublicSignup,
    quickLoginEnabled: appConfig?.quickLoginEnabled !== false,
    quickLoginMode: appConfig?.quickLoginMode === 'passwordless' ? 'passwordless' : 'autofill',
    modules: {
      neko: appConfig?.modules?.neko !== false,
      downloader: appConfig?.modules?.downloader !== false,
      mediaStudio: appConfig?.modules?.mediaStudio !== false,
      livekit: appConfig?.modules?.livekit !== false
    }
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Create user state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member',
    color: '#f472b6',
    avatar: '🌸',
    quickLoginVisible: true
  });

  // Revealed encrypted credentials map: userId -> { available, password, email, reason }
  const [revealedCreds, setRevealedCreds] = useState({});
  const [copiedId, setCopiedId] = useState('');

  // Edit user state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'member', password: '', quickLoginVisible: true, color: '#f472b6' });

  const onConfigUpdatedRef = useRef(onConfigUpdated);
  useEffect(() => {
    onConfigUpdatedRef.current = onConfigUpdated;
  }, [onConfigUpdated]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load admin overview');
      setUsers(data.users || []);
      if (data.config) {
        setSettings(data.config);
        onConfigUpdatedRef.current?.(data.config);
      }
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const showNotice = (type, text) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(prev => (prev.text === text ? { type: '', text: '' } : prev)), 4000);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      setNewUser({ name: '', email: '', password: '', role: 'member', color: '#f472b6', avatar: '🌸', quickLoginVisible: true });
      setShowCreateForm(false);
      showNotice('success', `Created user "${data.user.name}" and stored encrypted credentials.`);
      fetchOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleRevealPassword = async (userId) => {
    if (revealedCreds[userId]) {
      setRevealedCreds(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reveal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to decrypt credential');
      setRevealedCreds(prev => ({ ...prev, [userId]: data }));
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 1600);
  };

  const handleToggleQuickLoginVisibility = async (u) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ quickLoginVisible: !u.quickLoginVisible })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      fetchOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditForm({
      name: u.name,
      email: u.email,
      role: u.role,
      password: '',
      quickLoginVisible: u.quickLoginVisible !== false,
      color: u.color || '#f472b6'
    });
  };

  const handleSaveUserEdit = async (userId) => {
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        quickLoginVisible: editForm.quickLoginVisible,
        color: editForm.color
      };
      if (editForm.password.trim()) {
        payload.password = editForm.password;
      }
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');
      setEditingId(null);
      setRevealedCreds(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      showNotice('success', `Updated user "${data.user.name}".`);
      fetchOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleRevokeSessions = async (u) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}/revoke-sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke sessions');
      showNotice('success', `Revoked ${data.revokedSessions} active session(s) for ${u.name}.`);
      fetchOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Delete user "${u.name}" (${u.email}) and revoke all their sessions?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      showNotice('success', `Deleted "${u.name}" and revoked ${data.revokedSessions} session(s).`);
      fetchOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const saveSettingsObject = async (nextSettings) => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(nextSettings)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      setSettings(data.config);
      onConfigUpdated?.(data.config);
      showNotice('success', 'Server configuration saved.');
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    saveSettingsObject(settings);
  };

  const handleToggleNekoFromDiag = async (enabled) => {
    const next = { ...settings, modules: { ...settings.modules, neko: enabled } };
    setSettings(next);
    await saveSettingsObject(next);
  };

  return (
    <div className="admin-studio-layout">
      <aside className="admin-studio-sidebar">
        <div className="admin-studio-utility-row">
          <button type="button" className="btn-pink-chip" onClick={() => onNavigate?.('home')}>
            <ArrowLeft size={14} /> Home
          </button>
          <div className="admin-studio-medallion" title="Admin Control Center" aria-hidden="true">
            <Shield size={18} />
          </div>
        </div>

        <div>
          <h1 className="admin-studio-title">Admin Control Center</h1>
          <div className="admin-studio-subtitle">
            Credential vault, login policies, modules, and host diagnostics
          </div>
        </div>

        <nav className="admin-studio-drawer" aria-label="Admin sections">
          {[
            { id: 'users', label: 'Users & Vault', count: users.length, icon: Users },
            { id: 'settings', label: 'Auth & Modules', count: Object.values(settings.modules || {}).filter(Boolean).length, icon: Settings },
            { id: 'diagnostics', label: 'Diagnostics', count: 'Live', icon: Activity }
          ].map(({ id, label, count, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`admin-studio-drawer-tab ${tab === id ? 'active' : ''}`}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon size={15} /> {label}
              </span>
              <span className="admin-studio-nav-pill">{count}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="admin-studio-content">
        {banner.text && (
          <div
            className="admin-clay-card"
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 700,
              background: banner.type === 'error'
                ? 'linear-gradient(160deg, #fff1f2, #ffe4e6)'
                : 'linear-gradient(160deg, #ecfdf5, #d1fae5)',
              borderColor: banner.type === 'error' ? 'rgba(244,63,94,0.45)' : 'rgba(16,185,129,0.45)',
              color: banner.type === 'error' ? '#be123c' : '#047857'
            }}
          >
            <AlertCircle size={16} /> {banner.text}
          </div>
        )}

        {/* TAB 1: USERS & ENCRYPTED CREDENTIAL VAULT */}
        {tab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="admin-clay-card admin-vault-hero">
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                  Accounts &amp; AES-256-GCM Credential Vault
                </div>
                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: 3 }}>
                  Salted login hashes paired with AES-256-GCM encrypted recovery for invited companions.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="btn-pink-chip active">{users.length} Account{users.length === 1 ? '' : 's'}</span>
                <button
                  type="button"
                  className="btn-pink-primary"
                  onClick={() => setShowCreateForm(s => !s)}
                >
                  {showCreateForm ? <X size={15} /> : <UserPlus size={15} />}
                  {showCreateForm ? 'Close Form' : 'Create Member'}
                </button>
              </div>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateUser} className="admin-clay-card">
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#be185d', marginBottom: 14 }}>
                  Create New Member Account
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Display Name</label>
                    <input required value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} placeholder="Friend's name" className="admin-input" />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email or Username</label>
                    <input required value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} placeholder="friend@example.com" className="admin-input" />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Password</label>
                    <input required minLength={4} value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} placeholder="Min 4 characters" className="admin-input" />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Role</label>
                    <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} className="admin-input">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newUser.quickLoginVisible} onChange={e => setNewUser(u => ({ ...u, quickLoginVisible: e.target.checked }))} />
                    Show on Quick-Login screen
                  </label>
                  <button type="submit" className="btn-pink-primary">
                    <UserPlus size={15} /> Create User &amp; Save Credential
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="admin-clay-card" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Loading users...</div>
            ) : (
              <div className="admin-member-grid">
                {users.map(u => {
                  const isSelf = currentUser?.id === u.id;
                  const revealed = revealedCreds[u.id];
                  const isEditing = editingId === u.id;

                  return (
                    <div key={u.id} className="admin-member-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                        <JojoAvatar name={u.name} avatar={u.avatar} size={52} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--text-main)' }}>{u.name}</span>
                            <span className={`admin-role-badge ${u.role === 'admin' ? 'admin' : 'member'}`}>{u.role}</span>
                            {isSelf && <span style={{ fontSize: 11.5, color: '#059669', fontWeight: 800 }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, fontWeight: 500, wordBreak: 'break-word' }}>
                            {u.email} &middot; {u.activeSessionCount || 0} active session(s)
                          </div>
                        </div>
                      </div>

                      <div className="admin-chip-grid">
                        <button
                          type="button"
                          onClick={() => handleToggleQuickLoginVisibility(u)}
                          className={u.quickLoginVisible ? 'admin-pill-mint' : 'btn-pink-chip'}
                        >
                          Quick-Login: {u.quickLoginVisible ? 'Shown' : 'Hidden'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRevealPassword(u.id)}
                          className={`btn-pink-chip ${revealed ? 'active' : ''}`}
                        >
                          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                          {revealed ? 'Hide Password' : 'Reveal Password'}
                        </button>

                        <button
                          type="button"
                          onClick={() => isEditing ? setEditingId(null) : startEdit(u)}
                          className="btn-pink-secondary"
                          style={{ padding: '0.32rem 0.8rem', fontSize: '0.76rem', borderRadius: 999 }}
                        >
                          {isEditing ? <X size={13} /> : <Edit3 size={13} />} {isEditing ? 'Cancel' : 'Edit / Reset'}
                        </button>

                        {!isSelf && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRevokeSessions(u)}
                              title="Revoke active sessions"
                              className="admin-pill-amber"
                            >
                              <LogOut size={13} /> Revoke
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              title="Delete user"
                              className="admin-pill-danger"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          </>
                        )}
                      </div>

                      {revealed && (
                        <div className="admin-reveal-box">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <KeyRound size={15} color="#ec4899" />
                            {revealed.available ? (
                              <>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Password:</span>
                                <code style={{
                                  padding: '2px 9px', borderRadius: 8, background: '#fff',
                                  border: '1px solid rgba(236,72,153,0.3)', color: '#9d174d', fontWeight: 700, fontSize: 13
                                }}>
                                  {revealed.password}
                                </code>
                              </>
                            ) : (
                              <span style={{ color: '#b45309', fontWeight: 600 }}>{revealed.reason}</span>
                            )}
                          </div>
                          {revealed.available && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => handleCopy(`${u.id}-pw`, revealed.password)}
                                className="admin-pill-mint"
                              >
                                {copiedId === `${u.id}-pw` ? <Check size={12} /> : <Copy size={12} />}
                                {copiedId === `${u.id}-pw` ? 'Copied' : 'Copy Password'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(`${u.id}-all`, `Login: ${revealed.email}\nPassword: ${revealed.password}`)}
                                className="btn-pink-chip"
                              >
                                {copiedId === `${u.id}-all` ? <Check size={12} /> : <Copy size={12} />}
                                {copiedId === `${u.id}-all` ? 'Copied' : 'Copy Login'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {isEditing && (
                        <div style={{
                          paddingTop: 12,
                          borderTop: '1.5px dashed rgba(244,114,182,0.3)',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: 10,
                          alignItems: 'end'
                        }}>
                          <div>
                            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Name</label>
                            <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="admin-input" />
                          </div>
                          <div>
                            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email / Username</label>
                            <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="admin-input" />
                          </div>
                          <div>
                            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>New Password (optional)</label>
                            <input value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep" className="admin-input" />
                          </div>
                          <div>
                            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Role</label>
                            <select disabled={isSelf} value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className="admin-input">
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSaveUserEdit(u.id)}
                            className="btn-pink-primary"
                            style={{ justifyContent: 'center' }}
                          >
                            <Save size={14} /> Save
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INSTANCE & AUTH SETTINGS */}
        {tab === 'settings' && (
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="admin-clay-card">
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)', marginBottom: 14 }}>
                Instance &amp; Authentication Policy
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Instance Name</label>
                  <input
                    value={settings.instanceName}
                    onChange={e => setSettings(s => ({ ...s, instanceName: e.target.value }))}
                    className="admin-input"
                    style={{ maxWidth: 420 }}
                  />
                </div>

                <label className="admin-subpanel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-main)' }}>Allow Public User Sign-Ups</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Show the &ldquo;Sign Up&rdquo; tab on login and allow visitors to create Member accounts.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.allowPublicSignup}
                    onChange={e => setSettings(s => ({ ...s, allowPublicSignup: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: '#ec4899' }}
                  />
                </label>

                <label className="admin-subpanel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-main)' }}>Enable Quick-Login Profile Cards</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Display opted-in user avatars on the login gate.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.quickLoginEnabled}
                    onChange={e => setSettings(s => ({ ...s, quickLoginEnabled: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: '#ec4899' }}
                  />
                </label>

                {settings.quickLoginEnabled && (
                  <div style={{ paddingLeft: 14, borderLeft: '3px solid rgba(236,72,153,0.45)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: '#be185d' }}>Quick-Login Mode</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-main)', fontWeight: 600, cursor: 'pointer' }}>
                      <input type="radio" name="adminQlMode" checked={settings.quickLoginMode === 'autofill'} onChange={() => setSettings(s => ({ ...s, quickLoginMode: 'autofill' }))} style={{ accentColor: '#ec4899' }} />
                      <span>Autofill + Password Required (safer for public/WAN instances)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-main)', fontWeight: 600, cursor: 'pointer' }}>
                      <input type="radio" name="adminQlMode" checked={settings.quickLoginMode === 'passwordless'} onChange={() => setSettings(s => ({ ...s, quickLoginMode: 'passwordless' }))} style={{ accentColor: '#ec4899' }} />
                      <span>1-Click Passwordless (trusted LAN / household only)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="admin-clay-card">
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)', marginBottom: 12 }}>Feature Modules</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                {[
                  { key: 'neko', label: 'Shared Browser (Neko)', desc: 'Docker Chromium container (auto-stops when idle).' },
                  { key: 'downloader', label: 'Downloader', desc: 'Torrent magnet & yt-dlp downloader.' },
                  { key: 'mediaStudio', label: 'Media Studio', desc: 'Library transcoding & subtitle tools.' },
                  { key: 'livekit', label: 'LiveKit Voice & Camera', desc: 'SFU voice and video rooms.' }
                ].map(({ key, label, desc }) => (
                  <label key={key} className="admin-subpanel" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-main)' }}>{label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>{desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!settings.modules?.[key]}
                      onChange={e => setSettings(s => ({ ...s, modules: { ...s.modules, [key]: e.target.checked } }))}
                      style={{ width: 18, height: 18, marginTop: 2, accentColor: '#ec4899' }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={savingSettings} className="btn-pink-primary">
                <Save size={16} /> {savingSettings ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: DIAGNOSTICS */}
        {tab === 'diagnostics' && (
          <DiagnosticsPanel
            authToken={authToken}
            nekoEnabled={settings.modules?.neko !== false}
            onToggleNeko={handleToggleNekoFromDiag}
          />
        )}
      </section>
    </div>
  );
}
