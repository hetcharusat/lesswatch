import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Download, Play, Trash2, Link as LinkIcon, Heart } from 'lucide-react';

export function WatchPlanner({ onStartWatch }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('21:00');
  const [sourceUrl, setSourceUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [autoDownload, setAutoDownload] = useState(true);

  async function fetchPlans() {
    try {
      const res = await fetch('/api/planner');
      const data = await res.json();
      setPlans(data);
    } catch (err) {
      console.error('Failed to load plans:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPlans();
  }, []);

  async function handleAddPlan(e) {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const res = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, time, sourceUrl, notes })
      });
      const created = await res.json();

      if (autoDownload && sourceUrl) {
        await fetch(`/api/planner/${created.id}/download`, { method: 'POST' });
      }

      setTitle('');
      setSourceUrl('');
      setNotes('');
      fetchPlans();
    } catch (err) {
      alert('Error creating plan: ' + err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this planned watch date?')) return;
    await fetch(`/api/planner/${id}`, { method: 'DELETE' });
    fetchPlans();
  }

  async function handleTriggerDownload(id) {
    const res = await fetch(`/api/planner/${id}/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('wt_token') || ''}` }
    });
    const data = await res.json();
    alert(data.success ? '🚀 Download task started on server via Aria2!' : 'Download failed');
    fetchPlans();
  }

  return (
    <div className="planner-grid">
      {/* Form Card */}
      <div className="pink-card">
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} color="var(--pink-sakura)" />
            <span>Schedule Movie / Anime Date</span>
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Plan ahead! You can put a Magnet link or direct video URL, and it will auto-download to the server so it's ready when you watch.
          </p>
        </div>

        <form onSubmit={handleAddPlan} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              Movie or Anime Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Suzume (1080p Dual-Audio)"
              className="pink-input"
              style={{ paddingLeft: '1rem' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pink-input"
                style={{ paddingLeft: '1rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="pink-input"
                style={{ paddingLeft: '1rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              Magnet Link, Torrent, or Video URL
            </label>
            <div className="pink-input-group">
              <span className="pink-input-icon"><LinkIcon size={14} /></span>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="magnet:?xt=urn:btih:... or https://..."
                className="pink-input"
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              Notes / Snacks / Episode Details
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Popcorn ready! First 3 episodes 🍿"
              className="pink-input"
              style={{ paddingLeft: '1rem' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoDownload}
              onChange={(e) => setAutoDownload(e.target.checked)}
              style={{ accentColor: 'var(--pink-primary)' }}
            />
            <span>Auto-download via Aria2 / Torrent on server immediately</span>
          </label>

          <button type="submit" className="btn-pink-primary" style={{ justifyContent: 'center', marginTop: '0.4rem' }}>
            <Heart size={16} fill="currentColor" />
            <span>+ Add to Watch Schedule</span>
          </button>
        </form>
      </div>

      {/* Timeline Card */}
      <div className="pink-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
            Upcoming Watch Dates
          </h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            {plans.length} planned
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '520px', overflowY: 'auto' }}>
          {plans.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '3rem 1rem' }}>
              No upcoming watch dates scheduled yet.<br />Add one on the left! 🌸
            </div>
          ) : (
            plans.map((p) => {
              const statusClass = p.status === 'ready' ? 'status-badge-ready' : p.status === 'downloading' ? 'status-badge-downloading' : 'status-badge-planned';
              return (
                <div key={p.id} className="plan-item-row">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{p.title}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                        <span>📅 {p.date} at {p.time}</span>
                        <span>🏷️ {(p.sourceType || 'STREAM').toUpperCase()}</span>
                      </div>
                    </div>
                    <span className={statusClass}>{(p.status || 'PLANNED').toUpperCase()}</span>
                  </div>

                  {p.notes && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--pink-blush)', background: 'rgba(0,0,0,0.25)', padding: '0.4rem 0.65rem', borderRadius: 'var(--radius-sm)' }}>
                      💬 {p.notes}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button
                      onClick={() => onStartWatch(p.title, p.sourceUrl)}
                      className="btn-pink-primary"
                      style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                    >
                      <Play size={13} fill="currentColor" />
                      <span>Watch in Room</span>
                    </button>

                    {p.sourceUrl && p.status !== 'ready' && (
                      <button
                        onClick={() => handleTriggerDownload(p.id)}
                        className="btn-pink-secondary"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                      >
                        <Download size={13} />
                        <span>Download</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(p.id)}
                      className="btn-pink-chip"
                      style={{ marginLeft: 'auto', padding: '0.4rem' }}
                      title="Delete plan"
                    >
                      <Trash2 size={13} color="var(--text-dim)" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
