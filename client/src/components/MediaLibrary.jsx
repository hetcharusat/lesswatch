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

  // Modals & Popovers
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');
  const [moveModalFile, setMoveModalFile] = useState(null);
  const [selectedMoveTarget, setSelectedMoveTarget] = useState('');

  // Editing state
  const [editingFileRelPath, setEditingFileRelPath] = useState(null);
  const [editFileNameInput, setEditFileNameInput] = useState('');
  const [editingFolderRelPath, setEditingFolderRelPath] = useState(null);
  const [editFolderNameInput, setEditFolderNameInput] = useState('');

  // Audio processing per file state
  const [processingFiles, setProcessingFiles] = useState({});

  const handleProcessMediaAudio = async (file) => {
    const key = file.relativePath || file.filename;
    setProcessingFiles(p => ({ ...p, [key]: 'processing' }));
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
              setProcessingFiles(p => ({ ...p, [key]: 'ready' }));
              clearInterval(interval);
            }
          }
        } catch {}
      }, 3000);
    } catch {
      setProcessingFiles(p => ({ ...p, [key]: 'error' }));
    }
  };

  // Full management permissions always enabled for Het & Ria private lounge
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
        fetchLibrary(currentFolder);
      } else {
        alert(data.error || 'Failed to create folder');
      }
    } catch (err) {
      alert('Error creating folder: ' + err.message);
    }
  }

  // Rename folder
  async function handleRenameFolder(folderRelPath) {
    if (!editFolderNameInput.trim()) return;

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
          newName: editFolderNameInput.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setEditingFolderRelPath(null);
        fetchLibrary(currentFolder);
      } else {
        alert(data.error || 'Failed to rename folder');
      }
    } catch (err) {
      alert('Error renaming folder: ' + err.message);
    }
  }

  // Delete folder
  async function handleDeleteFolder(folderRelPath, folderName) {
    if (!confirm(`Are you sure you want to delete folder "${folderName}" and ALL files inside it? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch('/api/library/folder/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`,
          'x-user-profile': JSON.stringify(currentUser || { name: 'Het', role: 'admin' })
        },
        body: JSON.stringify({ folderPath: folderRelPath })
      });

      const data = await res.json();
      if (data.success) {
        fetchLibrary(currentFolder);
      } else {
        alert(data.error || 'Failed to delete folder');
      }
    } catch (err) {
      alert('Error deleting folder: ' + err.message);
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
          targetFolder: (selectedMoveTarget || '').replace(/\\/g, '/')
        })
      });

      const data = await res.json();
      if (data.success) {
        setMoveModalFile(null);
        fetchLibrary(currentFolder);
      } else {
        alert(data.error || 'Failed to move file');
      }
    } catch (err) {
      alert('Error moving file: ' + err.message);
    }
  }

  // Rename file
  async function handleRenameFile(fileRelPath) {
    if (!editFileNameInput.trim()) return;

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
          newName: editFileNameInput.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setEditingFileRelPath(null);
        fetchLibrary(currentFolder);
      } else {
        alert(data.error || 'Failed to rename file');
      }
    } catch (err) {
      alert('Error renaming file: ' + err.message);
    }
  }

  // Delete file
  async function handleDeleteFile(fileRelPath, filename) {
    if (!confirm(`Are you sure you want to delete "${filename}" from server storage?`)) {
      return;
    }

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
        fetchLibrary(currentFolder);
      } else {
        alert(data.error || 'Failed to delete file');
      }
    } catch (err) {
      alert('Error deleting file: ' + err.message);
    }
  }

  // File Upload directly to current folder
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
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
        fetchLibrary(currentFolder);
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  // Build breadcrumb segments
  const breadcrumbSegments = currentFolder ? currentFolder.split('/') : [];

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFiles = files.filter((f) =>
    f.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* 1st-Pouf Tactile Cushion Breadcrumb & Toolbar */}
      <div
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff0f5 100%)',
          borderRadius: '24px',
          padding: '0.85rem 1.25rem',
          boxShadow: '0 8px 24px rgba(244, 114, 182, 0.18), inset 0 2px 0 rgba(255, 255, 255, 0.9), inset 0 -2px 4px rgba(244, 114, 182, 0.15)',
          border: '1.5px solid rgba(244, 114, 182, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.85rem'
        }}
      >
        {/* Breadcrumb Path as Cute Marshmallow Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {currentFolder ? (
            <button
              onClick={handleGoUp}
              className="pouf-btn-tactile"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                background: 'linear-gradient(180deg, #ffffff 0%, #fdf2f8 100%)',
                border: '1.5px solid rgba(244, 114, 182, 0.4)',
                boxShadow: '0 4px 10px rgba(244, 114, 182, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Go back up"
            >
              <ClayArrow direction="left" size={16} />
            </button>
          ) : null}

          <button
            onClick={() => setCurrentFolder('')}
            className="pouf-btn-tactile"
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              background: currentFolder === ''
                ? 'linear-gradient(180deg, #f472b6 0%, #db2777 100%)'
                : 'linear-gradient(180deg, #ffffff 0%, #fdf2f8 100%)',
              color: currentFolder === '' ? '#ffffff' : '#831843',
              border: '1.5px solid rgba(244, 114, 182, 0.4)',
              boxShadow: currentFolder === ''
                ? '0 4px 12px rgba(219, 39, 119, 0.35)'
                : '0 4px 10px rgba(244, 114, 182, 0.12)',
              fontWeight: 800,
              fontSize: '0.86rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <ClayFolder size={18} />
            <span>Root Storage</span>
          </button>

          {breadcrumbSegments.map((segment, index) => {
            const segmentPath = breadcrumbSegments.slice(0, index + 1).join('/');
            const isLast = index === breadcrumbSegments.length - 1;
            return (
              <React.Fragment key={segmentPath}>
                <ClayArrow direction="right" size={14} />
                <button
                  onClick={() => !isLast && setCurrentFolder(segmentPath)}
                  className="pouf-btn-tactile"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    background: isLast
                      ? 'linear-gradient(180deg, #f472b6 0%, #db2777 100%)'
                      : 'linear-gradient(180deg, #ffffff 0%, #fdf2f8 100%)',
                    color: isLast ? '#ffffff' : '#831843',
                    border: '1.5px solid rgba(244, 114, 182, 0.4)',
                    boxShadow: isLast
                      ? '0 4px 12px rgba(219, 39, 119, 0.35)'
                      : '0 4px 10px rgba(244, 114, 182, 0.12)',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    cursor: isLast ? 'default' : 'pointer'
                  }}
                >
                  {segment}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Action Controls (Marshmallow 1st-pouf buttons & search) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Puffy Search Input */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#ffffff',
              borderRadius: '9999px',
              padding: '6px 14px',
              border: '1.5px solid rgba(244, 114, 182, 0.4)',
              boxShadow: 'inset 0 2px 4px rgba(244, 114, 182, 0.1)'
            }}
          >
            <ClaySearch size={16} />
            <input
              type="text"
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.84rem',
                fontWeight: 600,
                color: '#831843',
                width: '130px'
              }}
            />
          </div>

          {/* New Folder Button */}
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
                border: '1.5px solid rgba(245, 158, 11, 0.4)',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.8)',
                fontWeight: 800,
                fontSize: '0.84rem',
                cursor: 'pointer'
              }}
            >
              <ClayFolderPlus size={18} />
              <span>+ Folder</span>
            </button>
          )}

          {/* Upload Button */}
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
              border: '1.5px solid rgba(236, 72, 153, 0.4)',
              boxShadow: '0 4px 12px rgba(236, 72, 153, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.6)',
              fontWeight: 800,
              fontSize: '0.84rem',
              cursor: 'pointer'
            }}
          >
            <ClayUpload size={18} />
            <span>{uploading ? 'Uploading...' : 'Upload'}</span>
            <input type="file" onChange={handleFileUpload} accept="video/*,.mkv,.srt,.vtt,.ass" style={{ display: 'none' }} />
          </label>

          {/* Refresh Button */}
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
            title="Refresh"
          >
            <ClayRefresh size={18} />
          </button>
        </div>
      </div>

      {/* Folders Section */}
      {filteredFolders.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.85rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 14px',
                borderRadius: '9999px',
                background: 'linear-gradient(180deg, #fef9c3 0%, #fef08a 100%)',
                border: '1.5px solid rgba(245, 158, 11, 0.35)',
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.15)',
                fontWeight: 800,
                fontSize: '0.82rem',
                color: '#b45309',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              <ClayFolder size={18} />
              <span>Folders ({filteredFolders.length})</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.1rem' }}>
            {filteredFolders.map((f) => {
              const isEditing = editingFolderRelPath === f.relativePath;

              return (
                <div
                  key={f.relativePath}
                  className="pouf-btn-tactile"
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #fff7ed 100%)',
                    borderRadius: '22px',
                    padding: '1.1rem 1.25rem',
                    border: '1.5px solid rgba(251, 191, 36, 0.45)',
                    boxShadow: '0 8px 20px rgba(245, 158, 11, 0.14), inset 0 2px 0 rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(245, 158, 11, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}
                  onClick={() => !isEditing && handleOpenFolder(f.relativePath)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '16px',
                        background: 'linear-gradient(180deg, #fef9c3 0%, #fde047 100%)',
                        border: '1.5px solid rgba(245, 158, 11, 0.4)',
                        boxShadow: '0 4px 10px rgba(245, 158, 11, 0.2), inset 0 2px 0 rgba(255, 255, 255, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <ClayFolder size={30} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editFolderNameInput}
                            onChange={(e) => setEditFolderNameInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder(f.relativePath)}
                            className="pink-input"
                            style={{ fontSize: '0.84rem', padding: '0.3rem 0.6rem', borderRadius: '12px' }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleRenameFolder(f.relativePath)}
                            className="pouf-btn-tactile"
                            style={{ padding: '6px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #10b981', cursor: 'pointer' }}
                          >
                            <ClayCheck size={14} />
                          </button>
                          <button
                            onClick={() => setEditingFolderRelPath(null)}
                            className="pouf-btn-tactile"
                            style={{ padding: '6px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #ef4444', cursor: 'pointer' }}
                          >
                            <ClayClose size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontWeight: 800, color: '#451a03', fontSize: '0.98rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.name}
                          </div>
                          <div style={{
                            display: 'inline-block',
                            marginTop: '2px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '1px 8px',
                            borderRadius: '9999px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#b45309'
                          }}>
                            {f.itemCount} {f.itemCount === 1 ? 'item' : 'items'}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Cute Puffy Action Buttons (Admin Only) */}
                  {isAdmin && !isEditing && (
                    <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setEditingFolderRelPath(f.relativePath);
                          setEditFolderNameInput(f.name);
                        }}
                        className="pouf-btn-tactile"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: '#ffffff',
                          border: '1.5px solid rgba(244, 114, 182, 0.4)',
                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Rename folder"
                      >
                        <ClayEdit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(f.relativePath, f.name)}
                        className="pouf-btn-tactile"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: '#ffffff',
                          border: '1.5px solid rgba(239, 68, 68, 0.4)',
                          boxShadow: '0 2px 6px rgba(239, 68, 68, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Delete folder and contents"
                      >
                        <ClayTrash size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Files Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.85rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 14px',
              borderRadius: '9999px',
              background: 'linear-gradient(180deg, #fce7f3 0%, #fbcfe8 100%)',
              border: '1.5px solid rgba(236, 72, 153, 0.35)',
              boxShadow: '0 2px 6px rgba(236, 72, 153, 0.15)',
              fontWeight: 800,
              fontSize: '0.82rem',
              color: '#be185d',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            <ClayFilm size={18} />
            <span>Media Files ({filteredFiles.length})</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredFiles.length === 0 && filteredFolders.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '4rem 1.5rem',
                background: 'linear-gradient(180deg, #ffffff 0%, #fff0f5 100%)',
                borderRadius: '24px',
                border: '1.5px solid rgba(244, 114, 182, 0.3)',
                boxShadow: '0 8px 24px rgba(244, 114, 182, 0.12)'
              }}
            >
              <ClayPopcorn size={48} style={{ marginBottom: '1rem' }} />
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#831843', marginBottom: '0.4rem' }}>
                {loading ? 'Scanning server storage...' : 'No media files in this folder yet!'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#78345c', fontWeight: 500 }}>
                Upload files above or add downloads in the Downloads page 🍿
              </div>
            </div>
          ) : (
            filteredFiles.map((file) => {
              const isEditing = editingFileRelPath === file.relativePath;
              const ext = file.filename.split('.').pop()?.toUpperCase() || 'VIDEO';

              return (
                <div
                  key={file.relativePath}
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #fff5f8 100%)',
                    borderRadius: '22px',
                    padding: '1.25rem',
                    border: '1.5px solid rgba(244, 114, 182, 0.35)',
                    boxShadow: '0 8px 24px rgba(244, 114, 182, 0.14), inset 0 2px 0 rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(244, 114, 182, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem'
                  }}
                >
                  <div>
                    {/* Top Row: Format & Action Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          background: ext === 'MKV'
                            ? 'linear-gradient(180deg, #fbcfe8 0%, #f472b6 100%)'
                            : 'linear-gradient(180deg, #a7f3d0 0%, #34d399 100%)',
                          color: ext === 'MKV' ? '#831843' : '#064e3b',
                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                          letterSpacing: '0.5px'
                        }}
                      >
                        {ext}
                      </span>

                      <span
                        style={{
                          fontSize: '0.75rem',
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

                    {/* Title / Inline Rename */}
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '0.6rem' }}>
                        <input
                          type="text"
                          value={editFileNameInput}
                          onChange={(e) => setEditFileNameInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameFile(file.relativePath)}
                          className="pink-input"
                          style={{ fontSize: '0.84rem', borderRadius: '12px' }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleRenameFile(file.relativePath)}
                          className="pouf-btn-tactile"
                          style={{ padding: '6px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #10b981', cursor: 'pointer' }}
                        >
                          <ClayCheck size={14} />
                        </button>
                        <button
                          onClick={() => setEditingFileRelPath(null)}
                          className="pouf-btn-tactile"
                          style={{ padding: '6px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #ef4444', cursor: 'pointer' }}
                        >
                          <ClayClose size={14} />
                        </button>
                      </div>
                    ) : (
                      <h4
                        style={{
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          color: '#831843',
                          margin: '0 0 0.6rem 0',
                          wordBreak: 'break-word',
                          lineHeight: 1.4
                        }}
                      >
                        {file.filename}
                      </h4>
                    )}

                    {/* Metadata Pill Indicators */}
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
                            title="Pre-extract & cache all audio tracks for instant zero-lag switching"
                          >
                            <ClayHeadphones size={13} />
                            <span>
                              {processingFiles[file.relativePath || file.filename] === 'processing'
                                ? '⏳ Extracting Audio...'
                                : processingFiles[file.relativePath || file.filename] === 'ready'
                                ? '✓ All Audio Ready'
                                : `⚡ Process ${file.audioTracks.length} Audio Tracks`}
                            </span>
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '3px 10px',
                              borderRadius: '9999px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              color: '#b45309',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            <ClayHeadphones size={14} />
                            <span>1 Audio Track</span>
                          </span>
                        )
                      )}

                      {file.subtitles && file.subtitles.length > 0 && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            background: 'rgba(236, 72, 153, 0.15)',
                            border: '1px solid rgba(236, 72, 153, 0.35)',
                            color: '#be185d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <ClaySubtitles size={14} />
                          <span>{file.subtitles.length} Subtitles</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom Action Controls */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Prominent Marshmallow Play Button */}
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
                        gap: '8px',
                        padding: '9px 18px',
                        borderRadius: '9999px',
                        background: 'linear-gradient(180deg, #ec4899 0%, #be185d 100%)',
                        color: '#ffffff',
                        border: '1.5px solid rgba(255, 255, 255, 0.4)',
                        boxShadow: '0 6px 16px rgba(190, 24, 93, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.6), inset 0 -2px 4px rgba(0, 0, 0, 0.15)',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        cursor: 'pointer'
                      }}
                    >
                      <ClayPlay size={16} />
                      <span>Play Video</span>
                    </button>

                    {isAdmin && (
                      <>
                        {/* Move File */}
                        <button
                          onClick={() => {
                            setMoveModalFile(file);
                            setSelectedMoveTarget(currentFolder);
                          }}
                          className="pouf-btn-tactile"
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '12px',
                            background: '#ffffff',
                            border: '1.5px solid rgba(168, 85, 247, 0.4)',
                            boxShadow: '0 2px 6px rgba(168, 85, 247, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Move to another folder"
                        >
                          <ClayMove size={18} />
                        </button>

                        {/* Rename File */}
                        <button
                          onClick={() => {
                            setEditingFileRelPath(file.relativePath);
                            setEditFileNameInput(file.filename);
                          }}
                          className="pouf-btn-tactile"
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '12px',
                            background: '#ffffff',
                            border: '1.5px solid rgba(244, 114, 182, 0.4)',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Rename file"
                        >
                          <ClayEdit size={16} />
                        </button>

                        {/* Delete File */}
                        <button
                          onClick={() => handleDeleteFile(file.relativePath, file.filename)}
                          className="pouf-btn-tactile"
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '12px',
                            background: '#ffffff',
                            border: '1.5px solid rgba(239, 68, 68, 0.4)',
                            boxShadow: '0 2px 6px rgba(239, 68, 68, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Delete from server storage"
                        >
                          <ClayTrash size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* New Folder Modal (1st-pouf Marshmallow Popover) */}
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

      {/* Move File Modal */}
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
