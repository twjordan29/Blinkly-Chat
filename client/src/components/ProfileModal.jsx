import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { X, Camera, Save, Loader2, Sparkles } from 'lucide-react';

export default function ProfileModal({ isOpen, onClose }) {
  const { user, updateProfile, uploadAvatar } = useApp();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('avatar', selectedFile);
        await uploadAvatar(formData);
      }

      if (displayName.trim() !== user?.display_name) {
        await updateProfile(displayName);
      }

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name) => {
    return name ? name.substring(0, 2).toUpperCase() : '??';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-dark-950/40 dark:bg-dark-950/70 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="bg-sidebar w-full max-w-md rounded-2xl overflow-hidden relative z-10 shadow-premium-lg border border-bordercolor animate-scale-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-bordercolor bg-surface/30">
          <h2 className="text-md font-bold font-plus-jakarta text-text-primary flex items-center gap-2">
            <Sparkles className="w-4.5 h-4.5 text-accent" />
            Edit Profile
          </h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer flex items-center justify-center"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 space-y-5">
          
          {error && (
            <div className="p-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl">
              {error}
            </div>
          )}

          {/* Avatar Edit Section */}
          <div className="flex flex-col items-center gap-2.5">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              {/* Avatar Image Circle */}
              <div className="w-22 h-22 rounded-full overflow-hidden border-2 border-accent bg-surface flex items-center justify-center shadow-premium-sm transition-transform group-hover:scale-102">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                ) : user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-accent font-plus-jakarta">{getInitials(user?.display_name || user?.username)}</span>
                )}
              </div>
              
              {/* Camera Overlay */}
              <div className="absolute inset-0 w-22 h-22 rounded-full bg-dark-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-2 border-accent">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*"
            />
            
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-accent hover:underline font-semibold cursor-pointer"
            >
              Change Profile Photo
            </button>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-semibold mb-2 uppercase tracking-wider">
                Username
              </label>
              <input 
                type="text" 
                disabled 
                value={user?.username || ''}
                className="w-full premium-input text-text-muted cursor-not-allowed bg-surface/50 border-bordercolor"
              />
              <span className="text-[10px] text-text-muted mt-1 block">Username cannot be changed.</span>
            </div>

            <div>
              <label className="block text-text-secondary text-xs font-semibold mb-2 uppercase tracking-wider">
                Display Name
              </label>
              <input 
                type="text" 
                required
                placeholder="Enter your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full premium-input"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="premium-btn premium-btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="premium-btn premium-btn-primary flex-1"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
