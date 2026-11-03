import React, { useState, useEffect } from 'react';
import {
  ClayFilm,
  ClayFolder,
  ClayFolderPlus,
  ClayTv,
  ClayPopcorn,
  ClayPlay,
  ClaySearch,
  ClayRefresh,
  ClayUpload,
  ClayEdit,
  ClayTrash,
  ClayMove,
  ClayClose,
  ClayCheck,
  ClayArrow,
  ClayHeadphones,
  ClaySubtitles
} from './ClayIcons';
import { LayoutGrid, List, AlertTriangle, HardDrive, Filter, X, Check } from 'lucide-react';

function FileRenameInput({ initialFilename, fileRelPath, onRename, onCancel, size = 'normal' }) {
  const [val, setVal] = useState(initialFilename);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.stopPropagation();
    if (!val.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await onRename(fileRelPath, val.trim());
    setIsSubmitting(false);
  };

  const isSmall = size === 'small';

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: isSmall ? 0 : '0.6rem', width: '100%' }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') handleSubmit(e);
          if (e.key === 'Escape') onCancel();
        }}
        className="pink-input"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: isSmall ? '0.8rem' : '0.84rem',
          fontWeight: 600,
          padding: isSmall ? '4px 8px' : '6px 10px',
          borderRadius: isSmall ? '8px' : '10px',
          border: '2px solid #ec4899',
          background: '#ffffff',
          color: '#831843',
          outline: 'none',
          boxShadow: '0 0 0 3px rgba(236, 72, 153, 0.15)'
        }}
        autoFocus
      />
      <button
        type="button"
        disabled={isSubmitting}
        onClick={handleSubmit}
        style={{
          width: isSmall ? '28px' : '32px',
          height: isSmall ? '28px' : '32px',
          borderRadius: isSmall ? '8px' : '10px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          border: 'none',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isSubmitting ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
          flexShrink: 0
        }}
        title="Confirm Rename (Enter)"
      >
        <Check size={isSmall ? 14 : 16} strokeWidth={2.8} color="#ffffff" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        style={{
          width: isSmall ? '28px' : '32px',
          height: isSmall ? '28px' : '32px',
          borderRadius: isSmall ? '8px' : '10px',
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          border: 'none',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
          flexShrink: 0
        }}
        title="Cancel (Esc)"
      >
        <X size={isSmall ? 14 : 16} strokeWidth={2.8} color="#ffffff" />
      </button>
    </div>
  );
}

function FolderRenameInput({ initialName, folderRelPath, onRename, onCancel }) {
  const [val, setVal] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.stopPropagation();
    if (!val.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await onRename(folderRelPath, val.trim());
    setIsSubmitting(false);
  };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') handleSubmit(e);
          if (e.key === 'Escape') onCancel();
        }}
        className="pink-input"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: '0.82rem',
          fontWeight: 600,
          padding: '5px 8px',
          borderRadius: '8px',
          border: '2px solid #f59e0b',
          background: '#ffffff',
          color: '#451a03',
          outline: 'none'
        }}
        autoFocus
      />
      <button
        type="button"
        disabled={isSubmitting}
        onClick={handleSubmit}
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          border: 'none',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isSubmitting ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 6px rgba(16, 185, 129, 0.35)',
          flexShrink: 0
        }}
        title="Confirm Rename (Enter)"
      >
        <Check size={14} strokeWidth={2.8} color="#ffffff" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          border: 'none',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(239, 68, 68, 0.35)',
          flexShrink: 0
        }}
        title="Cancel (Esc)"
      >
        <X size={14} strokeWidth={2.8} color="#ffffff" />
      </button>
    </div>
  );
}

export function MediaLibrary({ onStartWatch, onPlayMedia, currentUser }) {
  const [currentFolder, setCurrentFolder] = useState('');
  const [parentFolder, setParentFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [allFoldersList, setAllFoldersList] = useState([]);
  const [storageInfo, setStorageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'video' | 'subtitle'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Modals & Confirmation Popovers
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');
  const [moveModalFile, setMoveModalFile] = useState(null);
  const [selectedMoveTarget, setSelectedMoveTarget] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(null); // { path, name }
  const [confirmDeleteFile, setConfirmDeleteFile] = useState(null); // { path, filename }

  // Inline Editing
  const [editingFileRelPath, setEditingFileRelPath] = useState(null);
  const [editingFolderRelPath, setEditingFolderRelPath] = useState(null);

  // Audio Processing per file
  const [processingFiles, setProcessingFiles] = useState({});

  // Toast feedback
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 3500);
  };

  const handleProcessMediaAudio = async (file) => {
    const key = file.relativePath || file.filename;
    setProcessingFiles((p) => ({ ...p, [key]: 'processing' }));
    showToast(`⚡ Processing audio tracks for "${file.filename}"...`);
    try {
      await fetch(`/api/media/process-audio/${encodeURIComponent(key)}`, { method: 'POST' });
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`/api/media/audio-status/${encodeURIComponent(key)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.allReady || attempts > 60) {
              setProcessingFiles((p) => ({ ...p, [key]: 'ready' }));
              clearInterval(interval);
              showToast(`✓ All audio tracks ready for "${file.filename}"`);
            }
          }
        } catch {}
      }, 3000);
    } catch {
      setProcessingFiles((p) => ({ ...p, [key]: 'error' }));
      showToast('❌ Audio processing failed');
    }
  };

  // Full admin permissions for room management
  const isAdmin = true;

  async function fetchLibrary(folder = currentFolder) {
    try {
      setLoading(true);
      const url = `/api/library?folder=${encodeURIComponent(folder || '')}`;
      const [libRes, sysRes] = await Promise.all([
        fetch(url),
        fetch('/api/system/storage').catch(() => null)
      ]);

      if (libRes.ok) {
        const libData = await libRes.json();
        setCurrentFolder(libData.currentFolder || '');
        setParentFolder(libData.parentFolder);
        setFolders(Array.isArray(libData.folders) ? libData.folders : []);
        setFiles(Array.isArray(libData.files) ? libData.files : []);
        setAllFoldersList(Array.isArray(libData.allFolders) ? libData.allFolders : []);
      }

      if (sysRes && sysRes.ok) {
        const sysData = await sysRes.json();
        setStorageInfo(sysData);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
      showToast('Error loading library');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLibrary(currentFolder);
  }, [currentFolder]);

  // Navigate into folder
  function handleOpenFolder(folderRelPath) {
    setCurrentFolder(folderRelPath);
  }

  // Navigate up to parent
  function handleGoUp() {
    if (parentFolder !== null) {
      setCurrentFolder(parentFolder);
    }
  }

  // Create new folder
  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderNameInput.trim()) return;

    try {
      const res = await fetch('/api/library/folder/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`
        },
        body: JSON.stringify({
          folderName: newFolderNameInput.trim(),
          parentFolder: currentFolder
        })
      });

      const data = await res.json();
      if (data.success) {
        setNewFolderNameInput('');
        setNewFolderModalOpen(false);
        showToast(`📁 Created folder "${newFolderNameInput.trim()}"`);
        fetchLibrary(currentFolder);
      } else {
        showToast(data.error || 'Failed to create folder');
      }
    } catch (err) {
      showToast('Error creating folder: ' + err.message);
    }
  }

  // Rename folder
  async function handleRenameFolder(folderRelPath, newName) {
    if (!newName || !newName.trim()) return;

    try {
      const res = await fetch('/api/library/folder/rename', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`,
          'x-user-profile': JSON.stringify(currentUser || { name: 'Het', role: 'admin' })
        },
        body: JSON.stringify({
          folderPath: folderRelPath,
          oldPath: folderRelPath,
          newName: newName.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setEditingFolderRelPath(null);
        showToast(`✓ Renamed to "${data.newName || newName.trim()}"`);
        fetchLibrary(currentFolder);
      } else {
        showToast(data.error || 'Failed to rename folder');
      }
    } catch (err) {
      showToast('Error renaming folder: ' + err.message);
    }
  }

  // Delete folder execution (Hardened with path + folderPath)
  async function executeDeleteFolder() {
    if (!confirmDeleteFolder) return;
    const { path: folderRelPath, name: folderName } = confirmDeleteFolder;

    try {
      const res = await fetch('/api/library/folder/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`,
          'x-user-profile': JSON.stringify(currentUser || { name: 'Het', role: 'admin' })
        },
        body: JSON.stringify({
          path: folderRelPath,
          folderPath: folderRelPath
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(`🗑️ Deleted folder "${folderName}"`);
        setConfirmDeleteFolder(null);
        fetchLibrary(currentFolder);
      } else {
        showToast(data.error || 'Failed to delete folder');
      }
    } catch (err) {
      showToast('Error deleting folder: ' + err.message);
    }
  }

  // Move file
  async function handleMoveFile() {
    if (!moveModalFile) return;

    try {
      const res = await fetch('/api/library/file/move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`,
          'x-user-profile': JSON.stringify(currentUser || { name: 'Het', role: 'admin' })
        },
        body: JSON.stringify({
          filePath: (moveModalFile.relativePath || moveModalFile.filename || '').replace(/\\/g, '/'),
          sourcePath: (moveModalFile.relativePath || moveModalFile.filename || '').replace(/\\/g, '/'),
          targetFolder: (selectedMoveTarget || '').replace(/\\/g, '/')
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(`📦 Moved "${moveModalFile.filename}"`);
        setMoveModalFile(null);
        fetchLibrary(currentFolder);
      } else {
        showToast(data.error || 'Failed to move file');
      }
    } catch (err) {
      showToast('Error moving file: ' + err.message);
    }
  }

  // Rename file
  async function handleRenameFile(fileRelPath, newName) {
    if (!newName || !newName.trim()) return;

    try {
      const res = await fetch('/api/library/file/rename', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`,
          'x-user-profile': JSON.stringify(currentUser || { name: 'Het', role: 'admin' })
        },
        body: JSON.stringify({
          filePath: fileRelPath,
          oldName: fileRelPath,
          newName: newName.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setEditingFileRelPath(null);
        showToast(`✓ Renamed file to "${data.newName || newName.trim()}"`);
        fetchLibrary(currentFolder);
      } else {
        showToast(data.error || 'Failed to rename file');
      }
    } catch (err) {
      showToast('Error renaming file: ' + err.message);
    }
  }

  // Delete file execution
  async function executeDeleteFile() {
    if (!confirmDeleteFile) return;
    const { path: fileRelPath, filename } = confirmDeleteFile;

    try {
      const cleanPath = (fileRelPath || filename || '').replace(/\\/g, '/');
      const res = await fetch(`/api/library/file?path=${encodeURIComponent(cleanPath)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`,
          'x-user-profile': JSON.stringify(currentUser || { name: 'Het', role: 'admin' })
        }
      });
      const data = await res.json();
      if (data.success) {
        showToast(`🗑️ Deleted "${filename}"`);
        setConfirmDeleteFile(null);
        fetchLibrary(currentFolder);
      } else {
        showToast(data.error || 'Failed to delete file');
      }
    } catch (err) {
      showToast('Error deleting file: ' + err.message);
    }
  }

  // File Upload directly to current folder
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    showToast(`Uploading "${file.name}"...`);
    const formData = new FormData();
    formData.append('mediaFile', file);
    if (currentFolder) {
      formData.append('folder', currentFolder);
    }

    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Uploaded "${file.name}"`);
        fetchLibrary(currentFolder);
      } else {
        showToast(data.error || 'Upload failed');
      }
    } catch (err) {
      showToast('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  // Breadcrumbs
  const breadcrumbSegments = currentFolder ? currentFolder.split('/').filter(Boolean) : [];

  // Filter items
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.filename.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    const isSub = /\.(srt|vtt|ass)$/i.test(f.filename);
    if (filterType === 'video') return !isSub;
    if (filterType === 'subtitle') return isSub;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            zIndex: 10000,
            background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.95), rgba(219, 39, 119, 0.95))',
            color: '#ffffff',
            padding: '10px 20px',
            borderRadius: '9999px',
            fontSize: '0.84rem',
            fontWeight: 800,
            boxShadow: '0 8px 24px rgba(236, 72, 153, 0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) both'
          }}
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. HERO HUB CARD: Title, Live Storage Stats, Search & Actions */}
      <div
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff0f6 100%)',
          borderRadius: '26px',
          padding: '1.25rem 1.6rem',
          boxShadow: '0 10px 30px rgba(244, 114, 182, 0.16), inset 0 2px 0 rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(244, 114, 182, 0.1)',
          border: '1.5px solid rgba(244, 114, 182, 0.32)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
      >
        {/* Top Hub Row: Title + Storage Info + Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #f472b6 0%, #db2777 100%)',
                boxShadow: '0 6px 16px rgba(219, 39, 119, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}
            >
              <ClayFilm size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: '#831843', letterSpacing: '-0.02em' }}>
                  Media Library
                </h2>
                {storageInfo && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 10px',
                      borderRadius: '9999px',
                      background: 'rgba(16, 185, 129, 0.14)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#065f46',
                      fontSize: '0.74rem',
                      fontWeight: 800
                    }}
                    title="Available Free Disk Space on Server"
                  >
                    <HardDrive size={12} />
                    <span>{storageInfo.diskFree || 'Available'} Free</span>
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#9d174d', fontWeight: 600 }}>
                High-speed local storage & zero-buffer multi-track streaming
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {isAdmin && (
              <button
                onClick={() => setNewFolderModalOpen(true)}
                className="pouf-btn-tactile"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 16px',
                  borderRadius: '9999px',
                  background: 'linear-gradient(180deg, #fef08a 0%, #f59e0b 100%)',
                  color: '#451a03',
                  border: '1.5px solid rgba(245, 158, 11, 0.45)',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.8)',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                <ClayFolderPlus size={16} />
                <span>+ New Folder</span>
              </button>
            )}

            <label
              className="pouf-btn-tactile"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                borderRadius: '9999px',
                background: 'linear-gradient(180deg, #fbcfe8 0%, #ec4899 100%)',
                color: '#ffffff',
                border: '1.5px solid rgba(236, 72, 153, 0.45)',
                boxShadow: '0 4px 12px rgba(236, 72, 153, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.6)',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              <ClayUpload size={16} />
              <span>{uploading ? 'Uploading...' : 'Upload Media'}</span>
              <input type="file" onChange={handleFileUpload} accept="video/*,.mkv,.mp4,.srt,.vtt,.ass" style={{ display: 'none' }} />
            </label>

            <button
              onClick={() => fetchLibrary(currentFolder)}
              className="pouf-btn-tactile"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(180deg, #ffffff 0%, #fdf2f8 100%)',
                border: '1.5px solid rgba(244, 114, 182, 0.4)',
                boxShadow: '0 4px 10px rgba(244, 114, 182, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Refresh Media Library"
            >
              <ClayRefresh size={16} />
            </button>
          </div>
        </div>

        {/* Second Hub Row: Search Bar + Filter Tabs + View Mode */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '6px', borderTop: '1px solid rgba(244, 114, 182, 0.2)' }}>
          {/* Search Box */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#ffffff',
              borderRadius: '9999px',
              padding: '6px 14px',
              border: '1.5px solid rgba(244, 114, 182, 0.4)',
              boxShadow: 'inset 0 2px 4px rgba(244, 114, 182, 0.08)',
              flex: '1 1 220px',
              maxWidth: '380px'
            }}
          >
            <ClaySearch size={16} />
            <input
              type="text"
              placeholder="Search movies, anime, subs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.84rem',
                fontWeight: 600,
                color: '#831843',
                width: '100%'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: '#9d174d', cursor: 'pointer', padding: 0 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filters & View Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: 'rgba(244, 114, 182, 0.14)', padding: '3px', borderRadius: '9999px', gap: '2px' }}>
              <button
                onClick={() => setFilterType('all')}
                style={{
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: filterType === 'all' ? '#ffffff' : 'transparent',
                  color: filterType === 'all' ? '#be185d' : '#9d174d',
                  boxShadow: filterType === 'all' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                All ({files.length})
              </button>
              <button
                onClick={() => setFilterType('video')}
                style={{
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: filterType === 'video' ? '#ffffff' : 'transparent',
                  color: filterType === 'video' ? '#be185d' : '#9d174d',
                  boxShadow: filterType === 'video' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                Videos ({files.filter((f) => !/\.(srt|vtt|ass)$/i.test(f.filename)).length})
              </button>
              <button
                onClick={() => setFilterType('subtitle')}
                style={{
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: filterType === 'subtitle' ? '#ffffff' : 'transparent',
                  color: filterType === 'subtitle' ? '#be185d' : '#9d174d',
                  boxShadow: filterType === 'subtitle' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                Subtitles ({files.filter((f) => /\.(srt|vtt|ass)$/i.test(f.filename)).length})
              </button>
            </div>

            {/* Grid vs List View Toggle */}
            <div style={{ display: 'flex', background: 'rgba(244, 114, 182, 0.14)', padding: '3px', borderRadius: '9999px', gap: '2px' }}>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  border: 'none',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                  color: viewMode === 'grid' ? '#be185d' : '#9d174d',
                  boxShadow: viewMode === 'grid' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                }}
                title="Grid View"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                style={{
                  border: 'none',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: viewMode === 'list' ? '#ffffff' : 'transparent',
                  color: viewMode === 'list' ? '#be185d' : '#9d174d',
                  boxShadow: viewMode === 'list' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                }}
                title="List View"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. BREADCRUMBS ROW */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '0 4px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {currentFolder ? (
            <button
              onClick={handleGoUp}
              className="pouf-btn-tactile"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: '#ffffff',
                border: '1.5px solid rgba(244, 114, 182, 0.4)',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Go back up one level"
            >
              <ClayArrow direction="left" size={14} />
            </button>
          ) : null}

          <button
            onClick={() => setCurrentFolder('')}
            className="pouf-btn-tactile"
            style={{
              padding: '5px 14px',
              borderRadius: '9999px',
              background: currentFolder === '' ? 'linear-gradient(135deg, #f472b6, #db2777)' : '#ffffff',
              color: currentFolder === '' ? '#ffffff' : '#831843',
              border: '1.5px solid rgba(244, 114, 182, 0.4)',
              boxShadow: currentFolder === '' ? '0 4px 10px rgba(219, 39, 119, 0.3)' : '0 2px 6px rgba(0,0,0,0.05)',
              fontWeight: 800,
              fontSize: '0.8rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <ClayFolder size={16} />
            <span>Root Storage</span>
          </button>

          {breadcrumbSegments.map((segment, index) => {
            const segmentPath = breadcrumbSegments.slice(0, index + 1).join('/');
            const isLast = index === breadcrumbSegments.length - 1;
            return (
              <React.Fragment key={segmentPath}>
                <ClayArrow direction="right" size={12} />
                <button
                  onClick={() => !isLast && setCurrentFolder(segmentPath)}
                  className="pouf-btn-tactile"
                  style={{
                    padding: '5px 14px',
                    borderRadius: '9999px',
                    background: isLast ? 'linear-gradient(135deg, #f472b6, #db2777)' : '#ffffff',
                    color: isLast ? '#ffffff' : '#831843',
                    border: '1.5px solid rgba(244, 114, 182, 0.4)',
                    boxShadow: isLast ? '0 4px 10px rgba(219, 39, 119, 0.3)' : '0 2px 6px rgba(0,0,0,0.05)',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    cursor: isLast ? 'default' : 'pointer'
                  }}
                >
                  {segment}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9d174d' }}>
          {filteredFolders.length} {filteredFolders.length === 1 ? 'folder' : 'folders'} • {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}
        </div>
      </div>

      {/* 3. FOLDERS SECTION */}
      {filteredFolders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#b45309', background: '#fef3c7', padding: '3px 10px', borderRadius: '9999px', border: '1px solid #fde68a' }}>
              Folders ({filteredFolders.length})
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.9rem' }}>
            {filteredFolders.map((f) => {
              const isEditing = editingFolderRelPath === f.relativePath;

              return (
                <div
                  key={f.relativePath}
                  className="pouf-btn-tactile"
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)',
                    borderRadius: '20px',
                    padding: '0.9rem 1.1rem',
                    border: '1.5px solid rgba(251, 191, 36, 0.45)',
                    boxShadow: '0 6px 16px rgba(245, 158, 11, 0.12), inset 0 2px 0 rgba(255, 255, 255, 0.95)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
                  }}
                  onClick={() => !isEditing && handleOpenFolder(f.relativePath)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '14px',
                        background: 'linear-gradient(180deg, #fef9c3 0%, #fde047 100%)',
                        border: '1.5px solid rgba(245, 158, 11, 0.4)',
                        boxShadow: '0 3px 8px rgba(245, 158, 11, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <ClayFolder size={22} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <FolderRenameInput
                          initialName={f.name}
                          folderRelPath={f.relativePath}
                          onRename={handleRenameFolder}
                          onCancel={() => setEditingFolderRelPath(null)}
                        />
                      ) : (
                        <>
                          <div
                            style={{
                              fontWeight: 800,
                              color: '#451a03',
                              fontSize: '0.92rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                            title={f.name}
                          >
                            {f.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600, marginTop: '2px' }}>
                            {f.itemCount} {f.itemCount === 1 ? 'item' : 'items'}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Folder Quick Actions */}
                  {isAdmin && !isEditing && (
                    <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setEditingFolderRelPath(f.relativePath);
                        }}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '8px',
                          background: '#ffffff',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Rename folder"
                      >
                        <ClayEdit size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteFolder({ path: f.relativePath, name: f.name })}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '8px',
                          background: '#ffffff',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          color: '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Delete folder"
                      >
                        <ClayTrash size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. MEDIA FILES SECTION */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.76rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9d174d', background: '#fce7f3', padding: '3px 10px', borderRadius: '9999px', border: '1px solid #fbcfe8' }}>
            Media Files ({filteredFiles.length})
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#9d174d', fontWeight: 700 }}>
            <ClayPopcorn size={40} />
            <div style={{ marginTop: '0.8rem', fontSize: '0.94rem' }}>Loading media files...</div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3.5rem 1rem',
              background: '#ffffff',
              borderRadius: '24px',
              border: '1.5px dashed rgba(244, 114, 182, 0.4)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)'
            }}
          >
            <ClayFilm size={44} />
            <h4 style={{ margin: '0.8rem 0 0.3rem 0', color: '#831843', fontWeight: 800 }}>No media files in this folder</h4>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#9d174d', fontWeight: 500 }}>
              Upload files above or download torrents/magnet links in the Downloads page 🍿
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.1rem' }}>
            {filteredFiles.map((file) => {
              const isEditing = editingFileRelPath === file.relativePath;
              const ext = file.filename.split('.').pop()?.toUpperCase() || 'MEDIA';
              const isSub = ['SRT', 'VTT', 'ASS'].includes(ext);

              return (
                <div
                  key={file.relativePath}
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #fff7fb 100%)',
                    borderRadius: '22px',
                    padding: '1.15rem 1.25rem',
                    border: '1.5px solid rgba(244, 114, 182, 0.32)',
                    boxShadow: '0 8px 22px rgba(244, 114, 182, 0.12), inset 0 2px 0 rgba(255, 255, 255, 0.95)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.9rem',
                    transition: 'all 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
                  }}
                >
                  <div>
                    {/* Top Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          background: isSub
                            ? 'linear-gradient(180deg, #fed7aa 0%, #f97316 100%)'
                            : ext === 'MKV'
                            ? 'linear-gradient(180deg, #fbcfe8 0%, #f472b6 100%)'
                            : 'linear-gradient(180deg, #a7f3d0 0%, #10b981 100%)',
                          color: '#ffffff',
                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)'
                        }}
                      >
                        {ext}
                      </span>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          background: 'rgba(244, 114, 182, 0.12)',
                          color: '#831843'
                        }}
                      >
                        {file.sizeFormatted}
                      </span>
                    </div>

                    {/* File Title */}
                    {isEditing ? (
                      <FileRenameInput
                        initialFilename={file.filename}
                        fileRelPath={file.relativePath}
                        onRename={handleRenameFile}
                        onCancel={() => setEditingFileRelPath(null)}
                      />
                    ) : (
                      <h4
                        style={{
                          fontSize: '0.92rem',
                          fontWeight: 800,
                          color: '#831843',
                          margin: '0 0 0.6rem 0',
                          wordBreak: 'break-word',
                          lineHeight: 1.35,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                        title={file.filename}
                      >
                        {file.filename}
                      </h4>
                    )}

                    {/* Tech Badges (Multi-audio & Subtitles) */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {file.audioTracks && file.audioTracks.length > 0 && (
                        file.audioTracks.length > 1 ? (
                          <button
                            onClick={() => handleProcessMediaAudio(file)}
                            className="pouf-btn-tactile"
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '3px 10px',
                              borderRadius: '9999px',
                              background: processingFiles[file.relativePath || file.filename] === 'ready'
                                ? 'rgba(16, 185, 129, 0.16)'
                                : processingFiles[file.relativePath || file.filename] === 'processing'
                                ? 'rgba(251, 191, 36, 0.2)'
                                : 'linear-gradient(135deg, rgba(244,114,182,0.18), rgba(236,72,153,0.18))',
                              border: processingFiles[file.relativePath || file.filename] === 'ready'
                                ? '1px solid rgba(16, 185, 129, 0.45)'
                                : processingFiles[file.relativePath || file.filename] === 'processing'
                                ? '1px solid rgba(251, 191, 36, 0.5)'
                                : '1px solid rgba(244, 114, 182, 0.4)',
                              color: processingFiles[file.relativePath || file.filename] === 'ready'
                                ? '#059669'
                                : processingFiles[file.relativePath || file.filename] === 'processing'
                                ? '#b45309'
                                : '#be185d',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              cursor: 'pointer'
                            }}
                            title="Pre-extract & cache all audio tracks for instant multi-audio sync"
                          >
                            <ClayHeadphones size={13} />
                            <span>
                              {processingFiles[file.relativePath || file.filename] === 'processing'
                                ? '⏳ Processing...'
                                : processingFiles[file.relativePath || file.filename] === 'ready'
                                ? '✓ Audio Ready'
                                : `⚡ ${file.audioTracks.length} Audio Tracks`}
                            </span>
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '3px 9px',
                              borderRadius: '9999px',
                              background: 'rgba(245, 158, 11, 0.12)',
                              color: '#b45309',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <ClayHeadphones size={12} />
                            <span>1 Audio Track</span>
                          </span>
                        )
                      )}

                      {file.subtitles && file.subtitles.length > 0 && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: '9999px',
                            background: 'rgba(236, 72, 153, 0.12)',
                            color: '#be185d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <ClaySubtitles size={12} />
                          <span>{file.subtitles.length} Subtitles</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Deck */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        if (onPlayMedia) onPlayMedia(file);
                        else if (onStartWatch) onStartWatch(file.filename, file.streamUrl);
                      }}
                      className="pouf-btn-tactile"
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '9999px',
                        background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
                        color: '#ffffff',
                        border: 'none',
                        boxShadow: '0 4px 14px rgba(190, 24, 93, 0.35)',
                        fontWeight: 800,
                        fontSize: '0.84rem',
                        cursor: 'pointer'
                      }}
                    >
                      <ClayPlay size={15} />
                      <span>Play in Lounge</span>
                    </button>

                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button
                          onClick={() => {
                            setMoveModalFile(file);
                            setSelectedMoveTarget(currentFolder);
                          }}
                          className="pouf-btn-tactile"
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            border: '1.5px solid rgba(168, 85, 247, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Move to another folder"
                        >
                          <ClayMove size={15} />
                        </button>

                        {!isEditing && (
                          <button
                            onClick={() => {
                              setEditingFileRelPath(file.relativePath);
                            }}
                            className="pouf-btn-tactile"
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '10px',
                              background: '#ffffff',
                              border: '1.5px solid rgba(244, 114, 182, 0.4)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            title="Rename file"
                          >
                            <ClayEdit size={14} />
                          </button>
                        )}

                        <button
                          onClick={() => setConfirmDeleteFile({ path: file.relativePath, filename: file.filename })}
                          className="pouf-btn-tactile"
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            border: '1.5px solid rgba(239, 68, 68, 0.4)',
                            color: '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Delete file permanently"
                        >
                          <ClayTrash size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filteredFiles.map((file) => {
              const ext = file.filename.split('.').pop()?.toUpperCase() || 'MEDIA';
              const isSub = ['SRT', 'VTT', 'ASS'].includes(ext);

              return (
                <div
                  key={file.relativePath}
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    padding: '10px 16px',
                    border: '1px solid rgba(244, 114, 182, 0.25)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: isSub ? '#fed7aa' : ext === 'MKV' ? '#fbcfe8' : '#a7f3d0',
                        color: isSub ? '#c2410c' : ext === 'MKV' ? '#9d174d' : '#065f46'
                      }}
                    >
                      {ext}
                    </span>
                    {isEditing ? (
                      <FileRenameInput
                        initialFilename={file.filename}
                        fileRelPath={file.relativePath}
                        onRename={handleRenameFile}
                        onCancel={() => setEditingFileRelPath(null)}
                        size="small"
                      />
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#831843', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.filename}>
                          {file.filename}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#9d174d', fontWeight: 600 }}>
                          {file.sizeFormatted}
                        </span>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => {
                        if (onPlayMedia) onPlayMedia(file);
                        else if (onStartWatch) onStartWatch(file.filename, file.streamUrl);
                      }}
                      className="pouf-btn-tactile"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 14px',
                        borderRadius: '9999px',
                        background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      <ClayPlay size={13} />
                      <span>Play</span>
                    </button>

                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => {
                            setMoveModalFile(file);
                            setSelectedMoveTarget(currentFolder);
                          }}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            background: '#ffffff',
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                            cursor: 'pointer'
                          }}
                          title="Move"
                        >
                          <ClayMove size={13} />
                        </button>
                        {!isEditing && (
                          <button
                            onClick={() => {
                              setEditingFileRelPath(file.relativePath);
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: '#ffffff',
                              border: '1px solid rgba(244, 114, 182, 0.4)',
                              cursor: 'pointer'
                            }}
                            title="Rename"
                          >
                            <ClayEdit size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDeleteFile({ path: file.relativePath, filename: file.filename })}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            background: '#ffffff',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            color: '#dc2626',
                            cursor: 'pointer'
                          }}
                          title="Delete"
                        >
                          <ClayTrash size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. CONFIRM DELETE FOLDER MODAL */}
      {confirmDeleteFolder && (
        <div className="pink-modal-backdrop" onClick={() => setConfirmDeleteFolder(null)}>
          <div
            className="pink-modal-card"
            style={{
              maxWidth: '420px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '2px solid rgba(239, 68, 68, 0.4)',
              boxShadow: '0 16px 40px rgba(239, 68, 68, 0.25)',
              padding: '1.5rem',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#991b1b', fontSize: '1.2rem', fontWeight: 900 }}>
              Delete Folder?
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', color: '#7f1d1d', fontSize: '0.86rem', lineHeight: 1.4 }}>
              Are you sure you want to delete <strong>"{confirmDeleteFolder.name}"</strong>? All media files and subfolders inside it will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteFolder(null)}
                className="pouf-btn-tactile"
                style={{
                  padding: '8px 18px',
                  borderRadius: '9999px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  color: '#374151',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteFolder}
                className="pouf-btn-tactile"
                style={{
                  padding: '8px 20px',
                  borderRadius: '9999px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 800,
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)',
                  cursor: 'pointer'
                }}
              >
                Yes, Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFIRM DELETE FILE MODAL */}
      {confirmDeleteFile && (
        <div className="pink-modal-backdrop" onClick={() => setConfirmDeleteFile(null)}>
          <div
            className="pink-modal-card"
            style={{
              maxWidth: '420px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '2px solid rgba(239, 68, 68, 0.4)',
              boxShadow: '0 16px 40px rgba(239, 68, 68, 0.25)',
              padding: '1.5rem',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#991b1b', fontSize: '1.2rem', fontWeight: 900 }}>
              Delete File?
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', color: '#7f1d1d', fontSize: '0.86rem', lineHeight: 1.4, wordBreak: 'break-word' }}>
              Are you sure you want to permanently delete <strong>"{confirmDeleteFile.filename}"</strong> from server storage?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteFile(null)}
                className="pouf-btn-tactile"
                style={{
                  padding: '8px 18px',
                  borderRadius: '9999px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  color: '#374151',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteFile}
                className="pouf-btn-tactile"
                style={{
                  padding: '8px 20px',
                  borderRadius: '9999px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 800,
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)',
                  cursor: 'pointer'
                }}
              >
                Yes, Delete File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. NEW FOLDER MODAL */}
      {newFolderModalOpen && (
        <div className="pink-modal-backdrop" onClick={() => setNewFolderModalOpen(false)}>
          <div
            className="pink-modal-card"
            style={{
              maxWidth: '420px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '2px solid rgba(244, 114, 182, 0.4)',
              boxShadow: '0 16px 40px rgba(219, 39, 119, 0.25)',
              padding: '1.5rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.15rem', fontWeight: 800, color: '#831843' }}>
                <ClayFolderPlus size={22} />
                <span>Create New Folder</span>
              </div>
              <button
                onClick={() => setNewFolderModalOpen(false)}
                className="pouf-btn-tactile"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <ClayClose size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: '#78345c', margin: '0 0 1rem 0', fontWeight: 500 }}>
              Location: <strong>{currentFolder ? `/${currentFolder}` : '/ (Root Storage)'}</strong>
            </p>

            <form onSubmit={handleCreateFolder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                placeholder="Folder name (e.g. Jojo, Anime, Movies)"
                value={newFolderNameInput}
                onChange={(e) => setNewFolderNameInput(e.target.value)}
                className="pink-input"
                style={{ borderRadius: '14px', fontSize: '0.88rem' }}
                autoFocus
                required
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setNewFolderModalOpen(false)}
                  className="pouf-btn-tactile"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    background: '#fdf2f8',
                    border: '1.5px solid rgba(244, 114, 182, 0.4)',
                    color: '#831843',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pouf-btn-tactile"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '9999px',
                    background: 'linear-gradient(180deg, #fef08a 0%, #f59e0b 100%)',
                    border: '1.5px solid rgba(245, 158, 11, 0.4)',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
                    color: '#451a03',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MOVE FILE MODAL */}
      {moveModalFile && (
        <div className="pink-modal-backdrop" onClick={() => setMoveModalFile(null)}>
          <div
            className="pink-modal-card"
            style={{
              maxWidth: '440px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '2px solid rgba(168, 85, 247, 0.4)',
              boxShadow: '0 16px 40px rgba(168, 85, 247, 0.25)',
              padding: '1.5rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.15rem', fontWeight: 800, color: '#581c87' }}>
                <ClayMove size={22} />
                <span>Move File</span>
              </div>
              <button
                onClick={() => setMoveModalFile(null)}
                className="pouf-btn-tactile"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <ClayClose size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: '#78345c', margin: '0 0 1rem 0', wordBreak: 'break-word', fontWeight: 600 }}>
              File: <strong style={{ color: '#db2777' }}>{moveModalFile.filename}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#78345c', fontWeight: 700 }}>Choose Destination Folder:</label>
              <select
                value={selectedMoveTarget}
                onChange={(e) => setSelectedMoveTarget(e.target.value)}
                className="pink-input"
                style={{ borderRadius: '14px', background: '#fff0f5', color: '#831843', padding: '0.65rem' }}
              >
                {allFoldersList.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setMoveModalFile(null)}
                className="pouf-btn-tactile"
                style={{
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  background: '#fdf2f8',
                  border: '1.5px solid rgba(244, 114, 182, 0.4)',
                  color: '#831843',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMoveFile}
                className="pouf-btn-tactile"
                style={{
                  padding: '8px 20px',
                  borderRadius: '9999px',
                  background: 'linear-gradient(180deg, #c084fc 0%, #9333ea 100%)',
                  border: '1.5px solid rgba(147, 51, 234, 0.4)',
                  boxShadow: '0 4px 12px rgba(147, 51, 234, 0.35)',
                  color: '#ffffff',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Move Here
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MediaLibrary;