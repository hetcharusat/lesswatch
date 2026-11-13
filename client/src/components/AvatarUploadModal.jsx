import React, { useState, useRef } from 'react';
import { Camera, X, UploadCloud, RefreshCw, Check, Sparkles, Image as ImageIcon } from 'lucide-react';
import { UserAvatar } from './JojoAvatar';

export function AvatarUploadModal({ isOpen, onClose, currentUser, onAvatarUpdated }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDataUrl, setPreviewDataUrl] = useState(null);
  const [convertedSizeKb, setConvertedSizeKb] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Client-side Web-Ready Image Processing (Crop to square, 256x256 WebP/JPEG, high-compression under 25KB)
  function processFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    setErrorMsg('');
    setIsProcessing(true);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 256; // Perfect resolution for high-DPI crisp avatars
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          // Center-crop to square preserving aspect ratio without distortion
          const minDim = Math.min(img.width, img.height);
          const startX = (img.width - minDim) / 2;
          const startY = (img.height - minDim) / 2;

          ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);

          // Convert to ultra-efficient Web-Ready WebP
          let dataUrl = canvas.toDataURL('image/webp', 0.88);
          // Fallback to jpeg if browser doesn't support webp canvas export
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          }

          // Compute size in KB
          const stringLength = dataUrl.length - 'data:image/webp;base64,'.length;
          const sizeInBytes = 4 * Math.ceil(stringLength / 3) * 0.5624896334383439;
          const sizeInKb = (sizeInBytes / 1000).toFixed(1);

          setPreviewDataUrl(dataUrl);
          setConvertedSizeKb(sizeInKb);
          setIsProcessing(false);
        } catch (err) {
          console.error('Image processing error:', err);
          setErrorMsg('Failed to process image. Please try another file.');
          setIsProcessing(false);
        }
      };
      img.onerror = () => {
        setErrorMsg('Failed to load image file.');
        setIsProcessing(false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleSaveAvatar() {
    if (!previewDataUrl) return;
    setIsSaving(true);
    setErrorMsg('');

    try {
      const token = localStorage.getItem('wt_token') || '';
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatarData: previewDataUrl })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save avatar');
      }

      setSaveSuccess(true);
      if (onAvatarUpdated) {
        onAvatarUpdated(data.avatar);
      }
      setTimeout(() => {
        onClose();
        setSaveSuccess(false);
      }, 700);
    } catch (err) {
      console.error('Save avatar error:', err);
      setErrorMsg(err.message || 'Error updating avatar on server.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetAvatar() {
    setIsSaving(true);
    setErrorMsg('');

    try {
      const token = localStorage.getItem('wt_token') || '';
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reset: true })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reset avatar');
      }

      setSaveSuccess(true);
      if (onAvatarUpdated) {
        onAvatarUpdated(data.avatar);
      }
      setTimeout(() => {
        onClose();
        setSaveSuccess(false);
      }, 600);
    } catch (err) {
      console.error('Reset avatar error:', err);
      setErrorMsg(err.message || 'Error resetting avatar.');
    } finally {
      setIsSaving(false);
    }
  }

  const isCurrentCustom = currentUser?.avatar && (
    currentUser.avatar.startsWith('/api/avatars') ||
    currentUser.avatar.startsWith('data:') ||
    currentUser.avatar.startsWith('http')
  );

  return (
    <div
      className="pink-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(10, 5, 15, 0.75)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        className="pink-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'linear-gradient(160deg, #1d1226 0%, #130a1b 100%)',
          borderRadius: '24px',
          border: '1.5px solid rgba(244, 114, 182, 0.35)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(244, 114, 182, 0.2)',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          color: '#ffffff',
          position: 'relative'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ background: 'rgba(236, 72, 153, 0.2)', padding: '6px', borderRadius: '10px', display: 'flex' }}>
              <Camera size={18} color="#f472b6" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                Profile Picture
              </h3>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                Auto-converted to web-ready & ultra lightweight
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="pink-btn-icon"
            style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Live Preview Stage */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '1.25rem 0',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '16px',
          border: '1px dashed rgba(244, 114, 182, 0.25)'
        }}>
          <div style={{ position: 'relative' }}>
            <UserAvatar
              user={{
                name: currentUser?.name || 'User',
                avatar: previewDataUrl || currentUser?.avatar
              }}
              size={96}
              showBorder={true}
            />
            {previewDataUrl && (
              <span style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                background: '#10b981',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                border: '2px solid #130a1b'
              }}>
                <Check size={13} color="#ffffff" />
              </span>
            )}
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#fbcfe8' }}>
              {currentUser?.name || 'User'}
            </div>
            {convertedSizeKb && (
              <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 700, marginTop: '2px' }}>
                ✨ Web-Ready: {convertedSizeKb} KB (Ultra Crisp)
              </div>
            )}
          </div>
        </div>

        {/* Drop Zone / Upload Trigger */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '1rem',
            borderRadius: '14px',
            background: 'rgba(244, 114, 182, 0.08)',
            border: '1px solid rgba(244, 114, 182, 0.25)',
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <UploadCloud size={24} color="#f472b6" />
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fce7f3' }}>
            {selectedFile ? selectedFile.name : 'Click to browse or drag & drop image'}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
            PNG, JPG, WEBP, GIF (Square cropped automatically)
          </div>
        </div>

        {errorMsg && (
          <div style={{ color: '#f87171', fontSize: '0.78rem', textAlign: 'center' }}>
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '0.25rem' }}>
          {isCurrentCustom && (
            <button
              type="button"
              onClick={handleResetAvatar}
              disabled={isSaving}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '9999px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
              title="Reset to default JoJo anime avatar"
            >
              <RefreshCw size={13} />
              <span>Reset Anime</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveAvatar}
            disabled={!previewDataUrl || isSaving}
            style={{
              flex: 2,
              padding: '9px 16px',
              borderRadius: '9999px',
              background: previewDataUrl
                ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
                : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: previewDataUrl ? '#ffffff' : '#6b7280',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: previewDataUrl ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: previewDataUrl ? '0 4px 14px rgba(236, 72, 153, 0.4)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            {isSaving ? (
              <span>Saving...</span>
            ) : saveSuccess ? (
              <>
                <Check size={15} />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Save New Avatar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
export default AvatarUploadModal;

