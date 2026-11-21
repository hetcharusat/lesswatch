import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Users, Settings, Activity, Eye, EyeOff, Copy, Check, UserPlus, Trash2, LogOut, Pencil, Save, X, ArrowLeft, AlertCircle, Search, RefreshCw, KeyRound, Monitor, Download, Film, Mic } from 'lucide-react';
import DiagnosticsPanel from './DiagnosticsPanel';
import { JojoAvatar } from './JojoAvatar';
import './AdminPanel.css';

const EMPTY_USER = { name: '', email: '', password: '', role: 'member', color: '#f472b6', avatar: '🌸', quickLoginVisible: true };
const MODULES = [
  ['neko', 'Shared browser', 'Browse together with Neko.', Monitor],
  ['downloader', 'Downloads', 'Direct links, torrents and magnets.', Download],
  ['mediaStudio', 'Media Studio', 'Prepare videos, audio and subtitles.', Film],
  ['livekit', 'Voice & camera', 'LiveKit voice and video rooms.', Mic]
];
const normalizeSettings = config => ({ instanceName: config?.instanceName || 'Watch Together', allowPublicSignup: !!config?.allowPublicSignup, quickLoginEnabled: config?.quickLoginEnabled !== false, quickLoginMode: config?.quickLoginMode === 'passwordless' ? 'passwordless' : 'autofill', modules: Object.fromEntries(MODULES.map(([key]) => [key, config?.modules?.[key] !== false])) });

function Switch({ label, description, checked, onChange, disabled }) {
  return <label className="adm-switch-row"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} /><i aria-hidden="true" /></label>;
}
function AccountFields({ value, setValue, editing = false, self = false }) {
  const [showPassword, setShowPassword] = useState(false);
  const field = key => event => setValue(previous => ({ ...previous, [key]: event.target.value }));
  return <div className="adm-fields">
    <label>Display name<input required autoComplete="name" value={value.name} onChange={field('name')} placeholder="Your friend's name" /></label>
    <label>Email or username<input required autoComplete="off" value={value.email} onChange={field('email')} placeholder="friend@example.com" /></label>
    <label>{editing ? 'New password' : 'Password'}<span className="adm-password-input"><input required={!editing} minLength={4} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={value.password} onChange={field('password')} placeholder={editing ? 'Leave blank to keep current' : 'At least 4 characters'} /><button type="button" aria-label={showPassword ? 'Hide entered password' : 'Show entered password'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></span></label>
    <label>Role<select disabled={self} value={value.role} onChange={field('role')}><option value="member">Member</option><option value="admin">Admin</option>{value.role === 'partner' && <option value="partner">Partner</option>}</select></label>
    <label>Profile color<input type="color" value={value.color || '#f472b6'} onChange={field('color')} /></label>
    <Switch label="Show on quick login" checked={value.quickLoginVisible !== false} onChange={e => setValue(v => ({ ...v, quickLoginVisible: e.target.checked }))} />
  </div>;
}
function ConfirmAction({ action, onClose, onConfirm, busy, error }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.querySelector('button')?.focus();
    const keydown = event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
        if (!buttons.length) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.isConnected && previous.focus(); };
  }, [busy, onClose]);
  return <div className="adm-confirm-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}><section className="adm-confirm" ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="adm-confirm-title" aria-describedby="adm-confirm-description"><h2 id="adm-confirm-title">{action.kind === 'delete' ? 'Delete account?' : 'Sign out all sessions?'}</h2><p id="adm-confirm-description">{action.kind === 'delete' ? `Remove ${action.user.name} and sign them out on every device. This cannot be undone.` : `Sign ${action.user.name} out on every device. They can sign in again with their password.`}</p>{error && <p className="adm-confirm-error" role="alert">{error}</p>}<div className="adm-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button className="adm-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : action.kind === 'delete' ? 'Delete account' : 'Sign out sessions'}</button></div></section></div>;
}

export default function AdminPanel({ authToken, currentUser, appConfig, onConfigUpdated, onNavigate }) {
  const [tab, setTab] = useState('users');
  const tabRef = useRef(tab); tabRef.current = tab;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [banner, setBanner] = useState({ type: '', text: '' });
  const [settings, setSettings] = useState(() => normalizeSettings(appConfig));
  const [savedSettings, setSavedSettings] = useState(() => normalizeSettings(appConfig));
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_USER);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_USER);
  const [revealedCreds, setRevealedCreds] = useState({});
  const [copiedId, setCopiedId] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [confirmation, setConfirmation] = useState(null);
  const [pending, setPending] = useState({});
  const pendingRef = useRef(new Set());
  const mounted = useRef(true);
  const noticeTimer = useRef(null), copyTimer = useRef(null), overviewController = useRef(null);
  const onConfigUpdatedRef = useRef(onConfigUpdated);
  onConfigUpdatedRef.current = onConfigUpdated;
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const savingSettings = !!pending.settings;

  const request = useCallback(async (url, options = {}) => {
    const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}`, ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}). Try again.`);
    return data;
  }, [authToken]);
  const showNotice = (type, text) => {
    clearTimeout(noticeTimer.current);
    setBanner({ type, text });
    if (type === 'success') noticeTimer.current = setTimeout(() => setBanner({ type: '', text: '' }), 5000);
  };
  const runAction = async (key, work) => {
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key); setPending(p => ({ ...p, [key]: true }));
    try { return await work(); }
    catch (error) { if (mounted.current) showNotice('error', error.name === 'TimeoutError' ? 'The server took too long to respond. Try again.' : error.message); }
    finally { pendingRef.current.delete(key); if (mounted.current) setPending(p => ({ ...p, [key]: false })); }
  };
  const fetchOverview = useCallback(async () => {
    overviewController.current?.abort();
    const controller = new AbortController(); overviewController.current = controller;
    setLoading(true); setLoadError('');
    try {
      const data = await request('/api/admin/overview', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (controller.signal.aborted) return;
      setUsers([...new Map((data.users || []).map(user => [user.id, user])).values()]);
      if (data.config && !dirtyRef.current) {
        const next = normalizeSettings(data.config); setSettings(next); setSavedSettings(next);
        onConfigUpdatedRef.current?.(data.config);
      }
    } catch (error) { if (!controller.signal.aborted) setLoadError(error.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [request]);
  useEffect(() => { mounted.current = true; fetchOverview(); return () => { mounted.current = false; overviewController.current?.abort(); clearTimeout(noticeTimer.current); clearTimeout(copyTimer.current); }; }, [fetchOverview]);
  useEffect(() => {
    if (!Object.keys(revealedCreds).length) return;
    const hide = () => { if (document.hidden) setRevealedCreds({}); };
    document.addEventListener('visibilitychange', hide);
    const timer = setTimeout(() => setRevealedCreds({}), 60000);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', hide); };
  }, [revealedCreds]);
  const updateUser = user => setUsers(previous => previous.map(item => item.id === user.id ? { ...item, ...user } : item));
  const handleCreateUser = event => {
    event.preventDefault();
    runAction('create', async () => {
      const data = await request('/api/admin/users', { method: 'POST', body: JSON.stringify(newUser) });
      setUsers(previous => [...previous.filter(user => user.id !== data.user.id), data.user]);
      setNewUser(EMPTY_USER); setShowCreateForm(false); showNotice('success', `Created ${data.user.name}.`);
    });
  };
  const handleRevealPassword = userId => {
    if (revealedCreds[userId]) { setRevealedCreds(previous => { const next = { ...previous }; delete next[userId]; return next; }); return; }
    runAction(userId, async () => {
      const data = await request(`/api/admin/users/${encodeURIComponent(userId)}/reveal`, { method: 'POST' });
      if (mounted.current && tabRef.current === 'users' && document.visibilityState !== 'hidden') setRevealedCreds(previous => ({ ...previous, [userId]: data }));
    });
  };
  const handleCopy = async (id, text) => {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopiedId(''), 1800); }
    catch { showNotice('error', 'Clipboard access was blocked. Select and copy the text instead.'); }
  };
  const handleToggleQuickLoginVisibility = user => runAction(user.id, async () => {
    const data = await request(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PUT', body: JSON.stringify({ quickLoginVisible: user.quickLoginVisible === false }) }); updateUser(data.user);
  });
  const startEdit = user => { setEditingId(user.id); setEditForm({ ...user, password: '' }); };
  const handleSaveUserEdit = userId => runAction(userId, async () => {
    const { name, email, role, color, quickLoginVisible, password } = editForm;
    const data = await request(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify({ name, email, role, color, quickLoginVisible, ...(password.trim() ? { password } : {}) }) });
    updateUser(data.user); setEditingId(null); setRevealedCreds({}); showNotice('success', `Updated ${data.user.name}.`);
  });
  const handleRevokeSessions = user => runAction(user.id, async () => {
    const data = await request(`/api/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`, { method: 'POST' });
    updateUser({ id: user.id, activeSessionCount: 0 }); setConfirmation(null); showNotice('success', `Signed out ${data.revokedSessions} session(s) for ${user.name}.`);
  });
  const handleDeleteUser = user => runAction(user.id, async () => {
    await request(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
    setUsers(previous => previous.filter(item => item.id !== user.id)); setRevealedCreds({}); setConfirmation(null); showNotice('success', `Deleted ${user.name}.`);
  });
  const saveSettingsObject = nextSettings => runAction('settings', async () => {
    const data = await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(nextSettings) });
    const next = normalizeSettings(data.config); setSettings(next); setSavedSettings(next); onConfigUpdatedRef.current?.(data.config); showNotice('success', 'Settings saved.');
  });
  const handleSaveSettings = event => { event.preventDefault(); saveSettingsObject(settings); };
  const handleToggleNekoFromDiag = enabled => saveSettingsObject({ ...savedSettings, modules: { ...savedSettings.modules, neko: enabled } });
  const changeTab = next => { setTab(next); setRevealedCreds({}); };
  const filteredUsers = users.filter(user => (roleFilter === 'all' || user.role === roleFilter) && `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  const sessions = users.reduce((total, user) => total + (user.activeSessionCount || 0), 0);
  const sections = [['users', 'People', Users], ['settings', 'Settings', Settings], ['diagnostics', 'System health', Activity]];

  return <div className="admin-workspace">
    <aside className="adm-sidebar"><button className="adm-back" onClick={() => onNavigate?.('home')}><ArrowLeft size={15} />Back home</button><div className="adm-brand"><Shield size={24} /><h1>Control room</h1><p>Keep your watch space in order.</p></div><nav aria-label="Admin sections">{sections.map(([id, label, Icon]) => <button key={id} aria-pressed={tab === id} onClick={() => changeTab(id)}><Icon size={17} /><span>{label}</span>{id === 'users' && <small>{users.length}</small>}{id === 'settings' && dirty && <i aria-label="Unsaved changes" />}</button>)}</nav><div className="adm-instance"><span className="adm-status-dot" /><span>{savedSettings.instanceName}<small>Administrator workspace</small></span></div></aside>
    <main className="adm-main">
      <header className="adm-heading"><div><p className="adm-context">Administration / {sections.find(([id]) => id === tab)[1]}</p><h2>{tab === 'users' ? 'A place for your people.' : tab === 'settings' ? 'Make it your space.' : 'Everything behind the screen.'}</h2><p>{tab === 'users' ? 'Accounts, access and quick login, all in one place.' : tab === 'settings' ? 'Manage sign-in and the features available to everyone.' : 'Check the host, streaming tools and room connections.'}</p></div>{tab === 'users' && <button className="adm-primary" disabled={loading || !!loadError} onClick={() => { setShowCreateForm(v => !v); setEditingId(null); }} aria-expanded={showCreateForm}>{showCreateForm ? <X size={16} /> : <UserPlus size={16} />}{showCreateForm ? 'Close form' : 'Add person'}</button>}</header>
      {banner.text && <div className={`adm-notice ${banner.type}`} role={banner.type === 'error' ? 'alert' : 'status'}><AlertCircle size={16} /><span>{banner.text}</span><button aria-label="Dismiss notice" onClick={() => setBanner({ type: '', text: '' })}><X size={15} /></button></div>}
      {loadError && <div className="adm-notice error" role="alert"><AlertCircle size={16} /><span>{loadError}</span><button disabled={loading} onClick={fetchOverview}>Retry loading</button></div>}
      {tab === 'users' && <>
        <div className="adm-summary"><span><strong>{users.length}</strong>People</span><span><strong>{sessions}</strong>Signed-in sessions</span><span><strong>{users.filter(user => user.role === 'admin').length}</strong>Administrators</span></div>
        {showCreateForm && <form className="adm-panel" onSubmit={handleCreateUser}><h3>Invite someone in</h3><p className="adm-muted">Create their account and choose how they sign in.</p><fieldset disabled={pending.create}><AccountFields value={newUser} setValue={setNewUser} /><div className="adm-actions"><button type="button" onClick={() => { setShowCreateForm(false); setNewUser(EMPTY_USER); }}>Cancel</button><button className="adm-primary" type="submit">{pending.create ? 'Creating…' : 'Create account'}</button></div></fieldset></form>}
        <div className="adm-list-toolbar"><label className="adm-search"><Search size={16} /><input aria-label="Search people" placeholder="Find a name or username…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filter by role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="all">All roles</option><option value="admin">Administrators</option><option value="member">Members</option>{users.some(user => user.role === 'partner') && <option value="partner">Partners</option>}</select><button disabled={loading} onClick={fetchOverview} aria-label="Refresh accounts"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button></div>
        <div className="adm-user-list" aria-busy={loading}>{loading && !users.length ? <p className="adm-empty" role="status">Loading accounts…</p> : !filteredUsers.length ? <div className="adm-empty"><Users size={26} /><h3>{search || roleFilter !== 'all' ? 'No matching people' : 'No accounts yet'}</h3><p>{search || roleFilter !== 'all' ? 'Try another name or role.' : 'Add someone to share your space.'}</p>{(search || roleFilter !== 'all') && <button onClick={() => { setSearch(''); setRoleFilter('all'); }}>Clear filters</button>}</div> : filteredUsers.map(user => {
          const self = user.id === currentUser?.id, revealed = revealedCreds[user.id], editing = editingId === user.id, busy = !!pending[user.id];
          return <article className="adm-user" key={user.id}><div className="adm-user-row"><JojoAvatar name={user.name} avatar={user.avatar} size={42} /><div className="adm-user-identity"><h3>{user.name}{self && <small>You</small>}</h3><p>{user.email}</p></div><span className={`adm-role ${user.role}`}>{user.role}</span><span className="adm-session-count">{user.activeSessionCount || 0} sessions</span><button disabled={busy} aria-expanded={editing} onClick={() => editing ? setEditingId(null) : startEdit(user)}><Pencil size={14} />{editing ? 'Close edit' : 'Edit'}</button></div>
            <div className="adm-user-tools"><button disabled={busy} aria-pressed={user.quickLoginVisible !== false} onClick={() => handleToggleQuickLoginVisibility(user)}><span className={`adm-status-dot ${user.quickLoginVisible === false ? 'off' : ''}`} />Quick login {user.quickLoginVisible === false ? 'hidden' : 'visible'}</button><button disabled={busy} onClick={() => handleRevealPassword(user.id)}>{revealed ? <EyeOff size={14} /> : <KeyRound size={14} />}{revealed ? 'Hide password' : 'Password'}</button>{!self && <><button disabled={busy} onClick={() => { setBanner({ type: '', text: '' }); setConfirmation({ kind: 'revoke', user }); }}><LogOut size={14} />Sign out sessions</button><button className="adm-delete" disabled={busy} onClick={() => { setBanner({ type: '', text: '' }); setConfirmation({ kind: 'delete', user }); }} aria-label={`Delete ${user.name}`}><Trash2 size={14} /></button></>}{busy && <small role="status">Working…</small>}</div>
            {revealed && <div className="adm-vault"><span>{revealed.available ? <><small>Password</small><code>{revealed.password}</code></> : revealed.reason || 'No recoverable password. Set a new one using Edit.'}</span>{revealed.available && <><button onClick={() => handleCopy(`${user.id}-password`, revealed.password)}>{copiedId === `${user.id}-password` ? <Check size={14} /> : <Copy size={14} />}{copiedId === `${user.id}-password` ? 'Copied' : 'Copy password'}</button><button onClick={() => handleCopy(`${user.id}-login`, `Login: ${revealed.email}\nPassword: ${revealed.password}`)}>{copiedId === `${user.id}-login` ? 'Copied' : 'Copy login'}</button></>}<small>Hidden after 60 seconds or when you leave this tab.</small></div>}
            {editing && <form className="adm-edit" onSubmit={e => { e.preventDefault(); handleSaveUserEdit(user.id); }}><fieldset disabled={busy}><AccountFields value={editForm} setValue={setEditForm} editing self={self} /><div className="adm-actions"><button type="button" onClick={() => setEditingId(null)}>Cancel</button><button className="adm-primary" type="submit"><Save size={14} />{busy ? 'Saving…' : 'Save account'}</button></div></fieldset></form>}
          </article>;
        })}</div>
      </>}
      {tab === 'settings' && <form className="adm-settings" onSubmit={handleSaveSettings}><fieldset disabled={savingSettings || loading || !!loadError}><section className="adm-panel"><h3>Your instance</h3><p className="adm-muted">The name everyone sees when they arrive.</p><label className="adm-name-field">Instance name<input required maxLength={80} value={settings.instanceName} onChange={e => setSettings(s => ({ ...s, instanceName: e.target.value }))} /></label></section><section className="adm-panel"><h3>Who gets in</h3><Switch label="Public sign-up" description="Let visitors create their own member accounts." checked={settings.allowPublicSignup} onChange={e => setSettings(s => ({ ...s, allowPublicSignup: e.target.checked }))} /><Switch label="Quick-login profiles" description="Show selected profiles on the sign-in screen." checked={settings.quickLoginEnabled} onChange={e => setSettings(s => ({ ...s, quickLoginEnabled: e.target.checked }))} />{settings.quickLoginEnabled && <label className="adm-mode">Quick-login behavior<select value={settings.quickLoginMode} onChange={e => setSettings(s => ({ ...s, quickLoginMode: e.target.value }))}><option value="autofill">Select profile, then enter password</option><option value="passwordless">Sign in with one click</option></select><small>{settings.quickLoginMode === 'passwordless' ? 'Anyone who can reach this site can enter a visible profile without its password.' : 'Profiles fill in the username. A password is still required.'}</small></label>}</section><section className="adm-panel"><h3>Available features</h3><p className="adm-muted">Choose what appears across your watch space.</p><div className="adm-modules">{MODULES.map(([key, label, description, Icon]) => <div key={key}><Icon size={20} /><Switch label={label} description={description} checked={!!settings.modules[key]} onChange={e => setSettings(s => ({ ...s, modules: { ...s.modules, [key]: e.target.checked } }))} /></div>)}</div></section><div className="adm-savebar"><span role="status">{savingSettings ? 'Saving changes…' : dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span><div className="adm-actions"><button type="button" disabled={!dirty} onClick={() => setSettings(savedSettings)}>Discard</button><button type="submit" className="adm-primary" disabled={!dirty}><Save size={15} />{savingSettings ? 'Saving…' : 'Save settings'}</button></div></div></fieldset></form>}
      {tab === 'diagnostics' && <div className="adm-diagnostics"><DiagnosticsPanel authToken={authToken} nekoEnabled={savedSettings.modules.neko} onToggleNeko={savingSettings || dirty ? null : handleToggleNekoFromDiag} />{dirty && <p className="adm-muted">Save or discard your settings draft before changing modules here.</p>}</div>}
    </main>
    {confirmation && <ConfirmAction error={banner.type === 'error' ? banner.text : ''} action={confirmation} busy={!!pending[confirmation.user.id]} onClose={() => setConfirmation(null)} onConfirm={() => confirmation.kind === 'delete' ? handleDeleteUser(confirmation.user) : handleRevokeSessions(confirmation.user)} />}
  </div>;
}
