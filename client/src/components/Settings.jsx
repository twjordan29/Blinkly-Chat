import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { 
  User, Paintbrush, Shield, Lock, LogOut, Camera, ArrowLeft, 
  Trash2, CheckCircle, AlertTriangle, ExternalLink, Globe, 
  MapPin, Info, Check, Loader2, Sparkles, Eye, Bell
} from 'lucide-react';

export default function Settings() {
  const { 
    user, 
    logout, 
    currentPath, 
    navigate, 
    theme, 
    themePreference,
    updateMeProfile,
    uploadMeAvatar,
    deleteMeAvatar,
    updateAppearance
  } = useApp();

  const [activeSection, setActiveSection] = useState('profile');
  const [isMobile, setIsMobile] = useState(false);

  // Profile data states
  const [profileData, setProfileData] = useState({
    display_name: user?.display_name || '',
    username: user?.username || '',
    bio: user?.bio || '',
    status_message: user?.status_message || '',
    location: user?.location || '',
    website_url: user?.website_url || '',
    show_online_status: user?.show_online_status !== false,
    show_last_seen: user?.show_last_seen !== false,
    allow_friend_requests: user?.allow_friend_requests !== false
  });

  // Avatar states
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Password change states
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // UX Feedback states
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [profileErrors, setProfileErrors] = useState({});
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Detect Mobile Viewport
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Sync profile data when user record updates
  useEffect(() => {
    if (user) {
      setProfileData({
        display_name: user.display_name || '',
        username: user.username || '',
        bio: user.bio || '',
        status_message: user.status_message || '',
        location: user.location || '',
        website_url: user.website_url || '',
        show_online_status: user.show_online_status !== false,
        show_last_seen: user.show_last_seen !== false,
        allow_friend_requests: user.allow_friend_requests !== false
      });
    }
  }, [user]);

  // Toast trigger helper
  const triggerToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  // Profile Avatar Select
  const handleAvatarSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      triggerToast('Image file size must be smaller than 5MB', 'error');
      return;
    }

    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMime.includes(file.type)) {
      triggerToast('Only JPG, PNG, and WEBP image uploads are supported', 'error');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Profile Avatar Save
  const handleSaveAvatar = async () => {
    if (!avatarFile) return;
    setSavingProfile(true);
    try {
      await uploadMeAvatar(avatarFile);
      setAvatarFile(null);
      setAvatarPreview(null);
      triggerToast('Profile photo updated successfully!');
    } catch (err) {
      triggerToast(err.message || 'Failed to upload photo', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Profile Avatar Reset
  const handleResetAvatar = async () => {
    if (window.confirm('Are you sure you want to reset your profile picture?')) {
      setSavingProfile(true);
      try {
        await deleteMeAvatar();
        setAvatarFile(null);
        setAvatarPreview(null);
        triggerToast('Profile photo reset successfully!');
      } catch (err) {
        triggerToast(err.message || 'Failed to reset photo', 'error');
      } finally {
        setSavingProfile(false);
      }
    }
  };

  // Profile Save
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});

    // Client-side validations
    const errors = {};
    if (!profileData.display_name.trim()) {
      errors.display_name = 'Display name cannot be empty';
    }
    if (!profileData.username.trim()) {
      errors.username = 'Username cannot be empty';
    } else if (profileData.username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }

    if (profileData.website_url.trim()) {
      const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
      if (!urlRegex.test(profileData.website_url.trim())) {
        errors.website_url = 'Invalid website URL format';
      }
    }

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      setSavingProfile(false);
      triggerToast('Please correct the validation errors', 'error');
      return;
    }

    try {
      // If there is an unsaved avatar, save it first
      if (avatarFile) {
        await uploadMeAvatar(avatarFile);
        setAvatarFile(null);
        setAvatarPreview(null);
      }

      await updateMeProfile({
        display_name: profileData.display_name,
        username: profileData.username,
        bio: profileData.bio,
        status_message: profileData.status_message,
        location: profileData.location,
        website_url: profileData.website_url,
        show_online_status: profileData.show_online_status,
        show_last_seen: profileData.show_last_seen,
        allow_friend_requests: profileData.allow_friend_requests
      });

      triggerToast('Profile updated successfully!');
    } catch (err) {
      triggerToast(err.message || 'Failed to update profile details', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Privacy Toggles Handler
  const handlePrivacyToggle = async (field) => {
    const nextVal = !profileData[field];
    setProfileData(prev => ({ ...prev, [field]: nextVal }));

    try {
      await updateMeProfile({
        [field]: nextVal
      });
      triggerToast('Privacy setting saved!');
    } catch (err) {
      setProfileData(prev => ({ ...prev, [field]: !nextVal })); // revert
      triggerToast(err.message || 'Failed to save settings', 'error');
    }
  };

  // Theme Select Handler
  const handleThemeChange = async (pref) => {
    try {
      await updateAppearance(pref);
      triggerToast(`Theme preference updated to ${pref}!`);
    } catch (err) {
      triggerToast('Failed to save theme settings', 'error');
    }
  };

  // Change Password
  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordData.currentPassword || !passwordData.newPassword) {
      setPasswordError('Please fill out all password fields');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch('/api/me/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('blinkly_token')}`
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Password update failed');
      }

      setPasswordSuccess('Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      triggerToast('Password updated successfully!');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // Helpers
  const getInitials = (name) => {
    return name ? name.substring(0, 2).toUpperCase() : '??';
  };

  const getRoleBadge = () => {
    if (user?.is_admin) {
      return (
        <span className="px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent font-bold rounded-md text-[9px] uppercase tracking-wide">
          Admin
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-text-muted/10 border border-text-muted/20 text-text-secondary font-bold rounded-md text-[9px] uppercase tracking-wide">
        User
      </span>
    );
  };

  const formattedDate = (dString) => {
    if (!dString) return '';
    const d = new Date(dString);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Sections navigation list
  const navItems = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Paintbrush },
    { id: 'account', label: 'Account & Security', icon: Shield },
    { id: 'privacy', label: 'Privacy settings', icon: Eye }
  ];

  return (
    <div className="min-h-screen bg-chat text-text-primary flex flex-col relative overflow-hidden pb-12">
      {/* Premium background mesh overlays */}
      <div className="absolute inset-0 bg-dot-pattern opacity-30 select-none pointer-events-none"></div>
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-accent/5 to-transparent select-none pointer-events-none"></div>

      {/* Floating Action Toast Alert */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up select-none max-w-sm">
          <div className={`
            flex items-center gap-3 px-4.5 py-3 rounded-xl border shadow-premium-lg font-plus-jakarta
            ${toast.type === 'error' 
              ? 'bg-red-500/10 border-red-500/20 text-red-500' 
              : 'bg-green-500/10 border-green-500/20 text-green-500'}
          `}>
            {toast.type === 'error' ? (
              <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
            ) : (
              <CheckCircle className="w-4.5 h-4.5 shrink-0" />
            )}
            <span className="text-xs font-semibold">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Navigation Top Header Bar */}
      <div className="w-full h-14 bg-sidebar border-b border-bordercolor flex items-center shrink-0 z-10 shadow-premium-sm">
        <div className="max-w-[1000px] w-full mx-auto px-4.5 flex items-center justify-between">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-all cursor-pointer font-bold text-xs select-none"
          >
            <ArrowLeft className="w-3.8 h-3.8" />
            <span>Back to Chat</span>
          </button>
          
          <div className="flex items-center gap-2 select-none">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-extrabold text-[12.5px] font-plus-jakarta tracking-wide">Settings</span>
          </div>
        </div>
      </div>

      {/* Main Settings Frame */}
      <div className="max-w-[1000px] w-full mx-auto px-4.5 mt-6 flex-1 flex flex-col md:flex-row gap-6 relative z-10">
        
        {/* LEFT NAV PANEL - Desktop Navigation */}
        <div className="hidden md:flex flex-col w-58 shrink-0 space-y-1 select-none">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`settings-nav-item ${isActive ? 'settings-nav-item-active' : ''}`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-text-secondary'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <hr className="my-3 border-bordercolor" />

          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to log out?')) {
                logout();
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-2.8 rounded-xl font-bold text-xs text-left cursor-pointer transition-all text-red-500 hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4 text-red-500" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* RIGHT CONTENT FRAME */}
        <div className="flex-1 space-y-6">

          {/* ===================================================
              PROFILE SECTION: Editable bio, details, avatar
             =================================================== */}
          {(isMobile || activeSection === 'profile') && (
            <div className="bg-sidebar rounded-2xl border border-bordercolor p-5.5 shadow-premium-sm animate-scale-in">
              <div className="flex items-center gap-2 mb-5 select-none">
                <User className="w-4.5 h-4.5 text-accent" />
                <h3 className="text-[13px] font-extrabold text-text-primary uppercase tracking-wider font-plus-jakarta">My Profile</h3>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-6">
                {/* Avatar upload center wrapper */}
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-surface/40 p-4 border border-bordercolor/80 rounded-2xl">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    {/* Circle Image Wrapper */}
                    <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-accent bg-surface flex items-center justify-center shadow-premium-sm select-none">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Selected preview" className="w-full h-full object-cover" />
                      ) : user?.avatar_url ? (
                        <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover animate-fade-in" />
                      ) : (
                        <span className="text-xl font-bold text-accent font-plus-jakarta">{getInitials(profileData.display_name || profileData.username)}</span>
                      )}
                    </div>
                    {/* Hover Camera overlay */}
                    <div className="absolute inset-0 w-20 h-20 rounded-full bg-dark-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-2 border-accent">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left">
                    <h4 className="text-xs font-bold text-text-primary mb-0.5">Profile Photo</h4>
                    <p className="text-[10.5px] text-text-secondary mb-2.5 max-w-[280px]">JPG, PNG, or WEBP. Max size 5MB.</p>
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleAvatarSelect}
                      className="hidden"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                    />
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-sidebar hover:bg-surface border border-bordercolor rounded-lg text-xs font-semibold text-text-primary cursor-pointer active:scale-95 transition-all select-none"
                      >
                        Change Photo
                      </button>
                      {user?.avatar_url && (
                        <button
                          type="button"
                          onClick={handleResetAvatar}
                          className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 active:scale-95 transition-all cursor-pointer"
                          title="Remove Profile Photo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={handleSaveAvatar}
                      className="mt-2 sm:mt-0 premium-btn premium-btn-primary h-9"
                    >
                      <Check className="w-4 h-4" />
                      Save Photo
                    </button>
                  )}
                </div>

                {/* Profile detail inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4.5">
                  <div className="flex flex-col">
                    <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-2">Display Name</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Jordan Smith"
                      value={profileData.display_name}
                      onChange={(e) => setProfileData(p => ({ ...p, display_name: e.target.value }))}
                      className={`premium-input ${profileErrors.display_name ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/10' : ''}`}
                    />
                    {profileErrors.display_name && (
                      <span className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {profileErrors.display_name}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-2">Username</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. jordan_smith"
                      value={profileData.username}
                      onChange={(e) => setProfileData(p => ({ ...p, username: e.target.value }))}
                      className={`premium-input ${profileErrors.username ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/10' : ''}`}
                    />
                    {profileErrors.username ? (
                      <span className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {profileErrors.username}
                      </span>
                    ) : (
                      <span className="text-[9.5px] text-text-muted mt-1">Unique handles only. Letters, numbers, _ and - allowed.</span>
                    )}
                  </div>

                  <div className="flex flex-col sm:col-span-2">
                    <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-2">Bio / Status Message</label>
                    <textarea 
                      placeholder="Tell us a little bit about yourself..."
                      value={profileData.bio}
                      rows={2.5}
                      maxLength={180}
                      onChange={(e) => setProfileData(p => ({ ...p, bio: e.target.value }))}
                      className="premium-textarea"
                    />
                    <span className="text-[9.5px] text-text-muted mt-1 self-end">{profileData.bio.length}/180</span>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-2">Location</label>
                    <div className="premium-input-wrapper">
                      <div className="premium-input-icon left-3.5">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input 
                        type="text"
                        placeholder="e.g. San Francisco, CA"
                        value={profileData.location}
                        onChange={(e) => setProfileData(p => ({ ...p, location: e.target.value }))}
                        className="premium-input premium-input-with-icon-left"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-2">Website URL</label>
                    <div className="premium-input-wrapper">
                      <div className="premium-input-icon left-3.5">
                        <Globe className="w-4 h-4" />
                      </div>
                      <input 
                        type="text"
                        placeholder="e.g. https://mywebsite.com"
                        value={profileData.website_url}
                        onChange={(e) => setProfileData(p => ({ ...p, website_url: e.target.value }))}
                        className={`premium-input premium-input-with-icon-left ${profileErrors.website_url ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/10' : ''}`}
                      />
                    </div>
                    {profileErrors.website_url && (
                      <span className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {profileErrors.website_url}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="premium-btn premium-btn-primary"
                  >
                    {savingProfile ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save Profile Details</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ===================================================
              APPEARANCE SECTION: system | light | dark theme preferences
             =================================================== */}
          {(isMobile || activeSection === 'appearance') && (
            <div className="bg-sidebar rounded-2xl border border-bordercolor p-5.5 shadow-premium-sm animate-scale-in">
              <div className="flex items-center gap-2 mb-5 select-none">
                <Paintbrush className="w-4.5 h-4.5 text-accent" />
                <h3 className="text-[13px] font-extrabold text-text-primary uppercase tracking-wider font-plus-jakarta">Appearance</h3>
              </div>

              <div className="space-y-4 select-none">
                <p className="text-[10.5px] text-text-secondary leading-relaxed">Customize how Blinkly looks on your device. Choose light, dark, or sync with your computer OS preference.</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                  
                  {/* System default card */}
                  <div 
                    onClick={() => handleThemeChange('system')}
                    className={`
                      border rounded-2xl p-4 cursor-pointer flex flex-col items-center gap-3 transition-all duration-150 active:scale-98
                      ${themePreference === 'system'
                        ? 'border-accent bg-accent/5 shadow-premium-sm' 
                        : 'border-bordercolor bg-surface/30 hover:bg-surface hover:border-bordercolor-hover'}
                    `}
                  >
                    <div className="w-8 h-8 rounded-full bg-linear-to-r from-gray-200 to-slate-800 border border-bordercolor flex items-center justify-center">
                      <Sparkles className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold block text-text-primary">System default</span>
                      <span className="text-[9.5px] text-text-secondary mt-0.5 block">Sync with operating system</span>
                    </div>
                    {themePreference === 'system' && <Check className="w-4 h-4 text-accent" />}
                  </div>

                  {/* Light mode card */}
                  <div 
                    onClick={() => handleThemeChange('light')}
                    className={`
                      border rounded-2xl p-4 cursor-pointer flex flex-col items-center gap-3 transition-all duration-150 active:scale-98
                      ${themePreference === 'light' 
                        ? 'border-accent bg-accent/5 shadow-premium-sm' 
                        : 'border-bordercolor bg-surface/30 hover:bg-surface hover:border-bordercolor-hover'}
                    `}
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <Paintbrush className="w-4.5 h-4.5 text-amber-500" />
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold block text-text-primary">Light Theme</span>
                      <span className="text-[9.5px] text-text-secondary mt-0.5 block">Clean, crisp, modern warmth</span>
                    </div>
                    {themePreference === 'light' && <Check className="w-4 h-4 text-accent" />}
                  </div>

                  {/* Dark mode card */}
                  <div 
                    onClick={() => handleThemeChange('dark')}
                    className={`
                      border rounded-2xl p-4 cursor-pointer flex flex-col items-center gap-3 transition-all duration-150 active:scale-98
                      ${themePreference === 'dark' 
                        ? 'border-accent bg-accent/5 shadow-premium-sm' 
                        : 'border-bordercolor bg-surface/30 hover:bg-surface hover:border-bordercolor-hover'}
                    `}
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
                      <Lock className="w-4.5 h-4.5 text-accent" />
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold block text-text-primary">Dark Theme</span>
                      <span className="text-[9.5px] text-text-secondary mt-0.5 block">Deep, comfortable midnight</span>
                    </div>
                    {themePreference === 'dark' && <Check className="w-4 h-4 text-accent" />}
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* ===================================================
              ACCOUNT & SECURITY SECTION: password change, details
             =================================================== */}
          {(isMobile || activeSection === 'account') && (
            <div className="bg-sidebar rounded-2xl border border-bordercolor p-5.5 shadow-premium-sm animate-scale-in">
              <div className="flex items-center gap-2 mb-5 select-none">
                <Shield className="w-4.5 h-4.5 text-accent" />
                <h3 className="text-[13px] font-extrabold text-text-primary uppercase tracking-wider font-plus-jakarta">Account & Security</h3>
              </div>

              <div className="space-y-6">
                
                {/* Account details summary card */}
                <div className="bg-surface/40 p-4 border border-bordercolor/80 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col select-none">
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Email Address</span>
                    <span className="text-xs font-medium text-text-primary mt-1 truncate">{user?.email}</span>
                  </div>
                  <div className="flex flex-col select-none">
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Username handle</span>
                    <span className="text-xs font-medium text-text-primary mt-1 truncate">@{user?.username}</span>
                  </div>
                  <div className="flex flex-col select-none">
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Member Since</span>
                    <span className="text-xs font-medium text-text-primary mt-1">{formattedDate(user?.created_at)}</span>
                  </div>
                  <div className="flex flex-col items-start select-none">
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-1">Account Role</span>
                    {getRoleBadge()}
                  </div>
                </div>

                <hr className="border-bordercolor" />

                {/* Password update form */}
                <form onSubmit={handlePasswordChangeSubmit} className="space-y-4">
                  <h4 className="text-xs font-bold text-text-primary flex items-center gap-1.5 select-none">
                    <Lock className="w-4 h-4 text-text-secondary" /> Change Password
                  </h4>
                  
                  {passwordError && (
                    <div className="p-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl font-medium animate-fade-in">
                      {passwordError}
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="p-3 text-xs text-green-500 bg-green-500/10 border border-green-500/20 rounded-xl font-medium animate-fade-in">
                      {passwordSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="flex flex-col">
                      <label className="text-[9.5px] text-text-secondary font-bold uppercase tracking-wider mb-2 select-none">Current Password</label>
                      <input 
                        type="password"
                        required
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData(p => ({ ...p, currentPassword: e.target.value }))}
                        placeholder="••••••••"
                        className="premium-input"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[9.5px] text-text-secondary font-bold uppercase tracking-wider mb-2 select-none">New Password</label>
                      <input 
                        type="password"
                        required
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData(p => ({ ...p, newPassword: e.target.value }))}
                        placeholder="••••••••"
                        className="premium-input"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[9.5px] text-text-secondary font-bold uppercase tracking-wider mb-2 select-none">Confirm New Password</label>
                      <input 
                        type="password"
                        required
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData(p => ({ ...p, confirmPassword: e.target.value }))}
                        placeholder="••••••••"
                        className="premium-input"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={savingPassword}
                      className="premium-btn premium-btn-secondary"
                    >
                      {savingPassword ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <span>Update Password</span>
                      )}
                    </button>
                  </div>
                </form>

                {isMobile && (
                  <>
                    <hr className="border-bordercolor" />
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to log out?')) {
                          logout();
                        }
                      }}
                      className="premium-btn premium-btn-danger w-full"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out of Blinkly</span>
                    </button>
                  </>
                )}

              </div>
            </div>
          )}

          {/* ===================================================
              PRIVACY SECTION: status, last seen, friend requests
             =================================================== */}
          {(isMobile || activeSection === 'privacy') && (
            <div className="bg-sidebar rounded-2xl border border-bordercolor p-5.5 shadow-premium-sm animate-scale-in">
              <div className="flex items-center gap-2 mb-5 select-none">
                <Eye className="w-4.5 h-4.5 text-accent" />
                <h3 className="text-[13px] font-extrabold text-text-primary uppercase tracking-wider font-plus-jakarta">Privacy Settings</h3>
              </div>

              <div className="space-y-5">
                
                {/* Toggle 1: Online Status */}
                <div className="flex items-center justify-between p-3 bg-surface/30 border border-bordercolor rounded-2xl">
                  <div className="flex-1 pr-4 select-none">
                    <span className="text-xs font-bold text-text-primary block mb-0.5">Show Online Status</span>
                    <span className="text-[10px] text-text-secondary leading-relaxed block">Allow your friends to see when you are active and online in the direct messages area.</span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => handlePrivacyToggle('show_online_status')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${profileData.show_online_status ? 'bg-accent' : 'bg-surface border-bordercolor'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-premium-sm ring-0 transition duration-200 ease-in-out ${profileData.show_online_status ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>

                {/* Toggle 2: Last Seen */}
                <div className="flex items-center justify-between p-3 bg-surface/30 border border-bordercolor rounded-2xl">
                  <div className="flex-1 pr-4 select-none">
                    <span className="text-xs font-bold text-text-primary block mb-0.5">Show Last Seen timestamp</span>
                    <span className="text-[10px] text-text-secondary leading-relaxed block">Display a "last seen" timestamp next to your avatar when you are offline in chats.</span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => handlePrivacyToggle('show_last_seen')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${profileData.show_last_seen ? 'bg-accent' : 'bg-surface border-bordercolor'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-premium-sm ring-0 transition duration-200 ease-in-out ${profileData.show_last_seen ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>

                {/* Toggle 3: Friend Requests */}
                <div className="flex items-center justify-between p-3 bg-surface/30 border border-bordercolor rounded-2xl">
                  <div className="flex-1 pr-4 select-none">
                    <span className="text-xs font-bold text-text-primary block mb-0.5">Allow Friend Requests</span>
                    <span className="text-[10px] text-text-secondary leading-relaxed block">Let other users search your handle and send you pending friend requests.</span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => handlePrivacyToggle('allow_friend_requests')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${profileData.allow_friend_requests ? 'bg-accent' : 'bg-surface border-bordercolor'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-premium-sm ring-0 transition duration-200 ease-in-out ${profileData.allow_friend_requests ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
