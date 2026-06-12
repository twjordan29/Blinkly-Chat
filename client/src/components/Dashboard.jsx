import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { 
  MessageSquare, Users, Settings, LogOut, Search, Send, Smile, 
  ChevronLeft, UserPlus, Check, CheckCheck, Shield, Volume2, 
  VolumeX, Bell, BellOff, Trash2, ArrowRight, UserCheck, X, Sparkles, 
  AlertCircle, Sun, Moon, Phone, Video, Info, Image
} from 'lucide-react';
import ProfileModal from './ProfileModal';
import AdminPanel from './AdminPanel';

// Sidebar Conversation Loading Skeleton
const ConversationSkeleton = () => (
  <div className="space-y-2 p-2">
    {[1, 2, 3, 4, 5].map(n => (
      <div key={n} className="flex items-center gap-3 p-3 rounded-xl border border-bordercolor animate-pulse bg-sidebar">
        <div className="w-10 h-10 rounded-full bg-bordercolor shrink-0"></div>
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-bordercolor rounded w-1/3"></div>
          <div className="h-2 bg-bordercolor rounded w-2/3"></div>
        </div>
      </div>
    ))}
  </div>
);

// Chat Message History Loading Skeleton
const MessageSkeleton = () => (
  <div className="space-y-4 p-4 flex-1 overflow-y-auto max-w-[950px] mx-auto w-full px-6">
    {[1, 2, 3, 4].map(n => (
      <div key={n} className={`flex items-end gap-2.5 ${n % 2 === 0 ? 'justify-end' : 'justify-start'} animate-pulse`}>
        {n % 2 !== 0 && <div className="w-7 h-7 rounded-full bg-bordercolor shrink-0"></div>}
        <div className="flex flex-col space-y-1 w-[40%]">
          <div className={`h-8.5 rounded-2xl bg-bordercolor ${n % 2 === 0 ? 'rounded-br-none' : 'rounded-bl-none'}`}></div>
          <div className={`h-2.5 rounded bg-bordercolor w-1/4 ${n % 2 === 0 ? 'self-end' : ''}`}></div>
        </div>
        {n % 2 === 0 && <div className="w-7 h-7 rounded-full bg-bordercolor shrink-0"></div>}
      </div>
    ))}
  </div>
);

// Stateful Avatar component that falls back to initials on error or invalid URLs
const Avatar = ({ url, name, sizeClass = "w-7 h-7", initialsClass = "text-[9.5px]" }) => {
  const [hasError, setHasError] = useState(false);
  
  useEffect(() => {
    setHasError(false);
  }, [url]);

  const getInitials = (n) => n ? n.substring(0, 2).toUpperCase() : '??';
  const isInvalid = !url || url === 'null' || url === 'undefined' || url.includes('null') || url.includes('undefined');

  if (isInvalid || hasError) {
    return (
      <div className={`${sizeClass} rounded-full bg-brand-600 flex items-center justify-center text-white ${initialsClass} font-bold select-none shrink-0`}>
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img 
      src={url} 
      alt={name} 
      onError={() => setHasError(true)} 
      className={`${sizeClass} rounded-full object-cover shrink-0`}
    />
  );
};

export default function Dashboard() {
  const {
    user,
    friends,
    requests,
    conversations,
    activeConversation,
    messages,
    onlineFriends,
    typingStatus,
    soundEnabled,
    notificationsEnabled,
    loadingConversations,
    loadingMessages,
    theme,
    toggleTheme,
    logout,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    selectConversation,
    sendMessage,
    retryMessage,
    sendImageMessage,
    sendTypingStart,
    sendTypingStop,
    toggleSound,
    requestNotificationPermission,
    toggleMessageReaction
  } = useApp();

  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [showEmojiBar, setShowEmojiBar] = useState(true);

  // Image Upload State (Phase 2)
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [imageCaption, setImageCaption] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [activeLightboxImage, setActiveLightboxImage] = useState(null);

  const imageFileInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);
  const prevActiveConversationIdRef = useRef(null);

  // Auto-scroll & New messages state
  const [hasNewMessagesBadge, setHasNewMessagesBadge] = useState(false);
  const [activeReactionMenuMessageId, setActiveReactionMenuMessageId] = useState(null);
  
  // Modals & Overlays
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [friendsActiveTab, setFriendsActiveTab] = useState('search'); // 'search' | 'pending' | 'list'
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const dropdownRef = useRef(null);

  // Recipient typing state (Phase 2 - declared early to avoid TDZ ReferenceErrors)
  const recipientTypingState = activeConversation && typingStatus &&
    typingStatus[activeConversation.conversation_id]?.[activeConversation.other_user_id];
  const isRecipientTyping = recipientTypingState?.isTyping === true;
  const recipientDisplayName = recipientTypingState?.displayName || activeConversation?.display_name || activeConversation?.username || 'Someone';

  // Auto-scroll helper
  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setHasNewMessagesBadge(false);
  };

  const isUserNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return false;
    const threshold = 150; // Treat user as near bottom if within 150px
    const scrollPosition = container.scrollHeight - container.scrollTop - container.clientHeight;
    return scrollPosition <= threshold;
  };

  // Smart Auto-scroll effect
  useEffect(() => {
    const currentConvoId = activeConversation?.conversation_id;
    const isConvoSwitch = prevActiveConversationIdRef.current !== currentConvoId;
    const isNewMessageAdded = messages.length > prevMessagesLengthRef.current;

    // Sync refs
    prevMessagesLengthRef.current = messages.length;
    prevActiveConversationIdRef.current = currentConvoId;

    if (loadingMessages) return;

    if (isConvoSwitch) {
      // Instant scroll when opening a conversation
      scrollToBottom('instant');
      setHasNewMessagesBadge(false);
      return;
    }

    if (isNewMessageAdded) {
      const lastMessage = messages[messages.length - 1];
      const isMine = Number(lastMessage?.sender_id) === Number(user?.id);

      if (isMine) {
        scrollToBottom('smooth');
      } else {
        if (isUserNearBottom()) {
          scrollToBottom('smooth');
        } else {
          setHasNewMessagesBadge(true);
        }
      }
    }
  }, [messages, loadingMessages, activeConversation]);

  // Click outside listener for settings dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setSettingsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape-key lightbox close listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveLightboxImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("Image is too large. Max size is 10MB.");
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert("Only JPG, JPEG, PNG, GIF, and WEBP images are supported.");
      return;
    }

    setSelectedImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
    setImageError('');
    setImageCaption('');
  };

  const handleSendImage = async () => {
    if (!selectedImageFile || !activeConversation) return;

    setUploadingImage(true);
    setImageError('');
    try {
      await sendImageMessage(activeConversation.conversation_id, selectedImageFile, imageCaption);
      // Success! Clear state
      setSelectedImageFile(null);
      setImagePreviewUrl(null);
      setImageCaption('');
    } catch (err) {
      console.error(err);
      setImageError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCancelImageUpload = () => {
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    setImageCaption('');
    setImageError('');
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = '';
    }
  };

  // Debounce search friends queries
  useEffect(() => {
    if (friendsActiveTab !== 'search' || !friendSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/friends/search?q=${encodeURIComponent(friendSearchQuery)}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('blinkly_token')}`
          }
        });
        const data = await response.json();
        setSearchResults(data.users || []);
      } catch (error) {
        console.error('Search request failed:', error);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [friendSearchQuery, friendsActiveTab]);

  // Typing state tracking refs
  const isTypingRef = useRef(false);
  const lastTypingTimeRef = useRef(0);
  const typingStopTimeoutRef = useRef(null);

  const stopTypingImmediately = () => {
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
    if (isTypingRef.current && activeConversation) {
      isTypingRef.current = false;
      sendTypingStop(activeConversation.conversation_id, activeConversation.other_user_id);
    }
  };

  // Stop typing on activeConversation change or unmount
  useEffect(() => {
    stopTypingImmediately();
    
    // Clear preview/caption input states if any
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    setImageCaption('');
    setImageError('');
    setHasNewMessagesBadge(false);
  }, [activeConversation]);

  // Keep chat pinned to bottom when recipient starts/stops typing
  useEffect(() => {
    if (isRecipientTyping && isUserNearBottom()) {
      scrollToBottom('smooth');
    }
  }, [isRecipientTyping]);

  // Typing event emission
  const handleMessageChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);

    if (!activeConversation) return;

    if (!value.trim()) {
      stopTypingImmediately();
      return;
    }

    const now = Date.now();
    // Throttle typing_start: send only once every 1.5 seconds
    if (!isTypingRef.current || now - lastTypingTimeRef.current > 1500) {
      isTypingRef.current = true;
      lastTypingTimeRef.current = now;
      sendTypingStart(activeConversation.conversation_id, activeConversation.other_user_id);
    }

    // Reset the typing_stop timeout
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
    }

    typingStopTimeoutRef.current = setTimeout(() => {
      stopTypingImmediately();
    }, 1500);
  };

  // Send message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    sendMessage(messageInput);
    setMessageInput('');
    stopTypingImmediately();
  };

  const insertEmoji = (emoji) => {
    setMessageInput(prev => prev + emoji);
    handleMessageChange({ target: { value: messageInput + emoji } });
  };

  // Helper validation for broken or undefined avatars
  const isValidAvatar = (url) => {
    if (!url) return false;
    if (url === 'null' || url === 'undefined') return false;
    if (url.includes('undefined') || url.includes('null')) return false;
    return true;
  };

  // Date/Time Formatters
  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getInitials = (name) => {
    return name ? name.substring(0, 2).toUpperCase() : '??';
  };

  const filteredConversations = conversations.filter(c => {
    const name = c.display_name || c.username || '';
    return name.toLowerCase().includes(chatSearchQuery.toLowerCase());
  });



  const pendingRequestsCount = requests.received?.length || 0;

  return (
    <div className="h-screen w-screen flex bg-surface text-text-primary overflow-hidden relative font-sans">
      
      {/* 1. LEFT SIDEBAR PANEL: Desktop width exactly 340px */}
      <div className={`
        ${activeConversation ? 'hidden md:flex' : 'flex'}
        w-full md:w-[340px] flex-col border-r border-bordercolor h-full shrink-0 z-20 bg-sidebar
      `}>
        
        {/* Sidebar Header */}
        <div className="p-3.5 flex items-center justify-between border-b border-bordercolor">
          <div className="flex items-center gap-2.5">
            {/* User Profile Avatar */}
            <div 
              onClick={() => setProfileOpen(true)}
              className="relative cursor-pointer hover:opacity-90 transition-all shrink-0 shadow-sm animate-fade-in"
            >
              <Avatar 
                url={user?.avatar_url} 
                name={user?.display_name || user?.username} 
                sizeClass="w-9 h-9 border border-bordercolor" 
                initialsClass="text-xs" 
              />
              {/* Simple Solid green dot */}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-sidebar"></span>
            </div>
            
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-text-primary truncate max-w-[130px] font-plus-jakarta leading-none">
                {user?.display_name || user?.username}
              </span>
              <span className="text-[9px] text-brand-500 font-bold tracking-wider flex items-center gap-0.5 mt-1">
                {user?.is_admin && <Shield className="w-2.5 h-2.5" />}
                {user?.is_admin ? 'ADMIN' : 'ONLINE'}
              </span>
            </div>
          </div>

          {/* Quick Actions Settings */}
          <div className="flex items-center gap-0.5 relative" ref={dropdownRef}>
            
            <button 
              onClick={() => {
                setFriendsModalOpen(true);
                setFriendsActiveTab('search');
              }}
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors relative"
              title="Friends"
            >
              <Users className="w-4 h-4" />
              {pendingRequestsCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-brand-500 rounded-full"></span>
              )}
            </button>

            <button 
              onClick={() => toggleSound(!soundEnabled)}
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
              title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-text-muted" />}
            </button>

            <button 
              onClick={() => navigate('/settings')}
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Dropdown Menu */}
            {settingsDropdownOpen && (
              <div className="absolute right-0 top-9 w-48 rounded-xl bg-sidebar border border-bordercolor p-1 shadow-premium-lg z-30 animate-scale-in">
                <button 
                  onClick={() => {
                    setSettingsDropdownOpen(false);
                    setProfileOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
                >
                  Edit Profile
                </button>
                <button 
                  onClick={() => {
                    setSettingsDropdownOpen(false);
                    toggleTheme();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors flex items-center justify-between"
                >
                  <span>App Theme</span>
                  <span className="text-[10px] text-brand-500 font-bold capitalize flex items-center gap-1">
                    {theme === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                    {theme}
                  </span>
                </button>
                <button 
                  onClick={() => {
                    setSettingsDropdownOpen(false);
                    requestNotificationPermission();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors flex items-center justify-between"
                >
                  <span>Notifications</span>
                  {notificationsEnabled ? (
                    <span className="text-[10px] text-green-500 font-bold">On</span>
                  ) : (
                    <span className="text-[10px] text-text-muted">Off</span>
                  )}
                </button>

                {user?.is_admin && (
                  <button 
                    onClick={() => {
                      setSettingsDropdownOpen(false);
                      setAdminOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-brand-500 hover:bg-brand-500/10 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <span>Admin Panel</span>
                    <Shield className="w-3 h-3" />
                  </button>
                )}
                
                <hr className="my-1 border-bordercolor" />
                
                <button 
                  onClick={() => {
                    setSettingsDropdownOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex items-center justify-between"
                >
                  <span>Log Out</span>
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Sidebar Search */}
        <div className="p-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.8 h-3.8 text-text-muted" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              className="w-full premium-input pl-9 pr-3 py-2 rounded-xl text-xs placeholder:text-text-muted focus:outline-none"
            />
          </div>
        </div>

        {/* Sidebar Conversations list */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-4">
          <div className="flex items-center justify-between px-2 py-1.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">
            <span>Conversations</span>
            <span>{filteredConversations.length}</span>
          </div>

          {loadingConversations ? (
            <ConversationSkeleton />
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 px-4 animate-fade-in">
              <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center mx-auto mb-2.5 border border-bordercolor">
                <MessageSquare className="w-4.5 h-4.5 text-text-muted" />
              </div>
              <h4 className="text-xs font-bold text-text-primary mb-0.5">No chats yet</h4>
              <p className="text-[10px] text-text-secondary max-w-[160px] mx-auto leading-relaxed">Search for users and start sending messages!</p>
              <button 
                onClick={() => {
                  setFriendsModalOpen(true);
                  setFriendsActiveTab('search');
                }}
                className="mt-3 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-[10.5px] rounded-lg transition-all"
              >
                Find Friends
              </button>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = activeConversation?.conversation_id === conv.conversation_id;
              const isOnline = onlineFriends.has(conv.other_user_id) || conv.is_online === 1;
              const userTyping = typingStatus[conv.conversation_id]?.[conv.other_user_id];
              const isUnread = conv.unread_count > 0;

              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => selectConversation(conv)}
                  className={`
                    relative flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer select-none border transition-all duration-150
                    hover:bg-surface/50 active:scale-[0.99]
                    ${isSelected 
                      ? 'bg-surface border-bordercolor shadow-premium-sm ring-1 ring-brand-500/10' 
                      : 'border-transparent'}
                  `}
                >
                  {/* Left rounded brand indicator for active selected card */}
                  {isSelected && (
                    <div className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-brand-500 rounded-r-full"></div>
                  )}

                  {/* Avatar details */}
                  <div className="relative shrink-0">
                    <Avatar 
                      url={conv.avatar_url} 
                      name={conv.display_name || conv.username} 
                      sizeClass="w-10 h-10 border border-bordercolor" 
                      initialsClass="text-xs text-brand-500" 
                    />
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-sidebar"></span>
                    )}
                  </div>

                  {/* Texts details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className={`text-xs truncate font-plus-jakarta ${isUnread ? 'font-bold text-text-primary' : 'font-medium text-text-primary'}`}>
                        {conv.display_name || conv.username}
                      </h4>
                      <span className={`text-[9px] ${isUnread ? 'text-brand-500 font-bold' : 'text-text-muted'}`}>
                        {formatTime(conv.last_message_time || conv.updated_at)}
                      </span>
                    </div>
                    
                    <p className={`
                      text-[10.5px] truncate 
                      ${userTyping 
                        ? 'text-brand-500 font-semibold' 
                        : isUnread 
                          ? 'text-text-primary font-bold' 
                          : 'text-text-secondary'}
                    `}>
                      {userTyping ? 'typing...' : conv.last_message || 'No messages yet'}
                    </p>
                  </div>

                  {/* Unread badge dot */}
                  {isUnread && (
                    <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 shadow shadow-brand-500/20"></span>
                  )}

                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. CHAT CANVAS AREA */}
      <div className={`
        ${!activeConversation ? 'hidden md:flex' : 'flex'}
        flex-1 flex-col h-full bg-chat bg-dot-pattern/50 relative
      `}>
        
        {activeConversation ? (
          <>
            {/* Compact premium Chat Header */}
            <div className="h-13 border-b border-bordercolor px-4 flex items-center justify-between bg-sidebar z-10 shadow-premium-sm shrink-0">
              
              {/* Left Profile details */}
              <div className="flex items-center gap-2.5 min-w-0">
                <button 
                  onClick={() => selectConversation(null)}
                  className="md:hidden p-1 rounded-lg hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="relative shrink-0">
                  <Avatar 
                    url={activeConversation.avatar_url} 
                    name={activeConversation.display_name || activeConversation.username} 
                    sizeClass="w-8.5 h-8.5 border border-bordercolor" 
                    initialsClass="text-xs text-brand-500" 
                  />
                  {(onlineFriends.has(activeConversation.other_user_id) || activeConversation.is_online === 1) && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-sidebar"></span>
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-text-primary truncate font-plus-jakarta leading-none mb-0.5">
                    {activeConversation.display_name || activeConversation.username}
                  </span>
                  <span className="text-[9.5px] text-text-muted">
                    {isRecipientTyping ? (
                      <span className="text-brand-500 font-bold animate-pulse">typing...</span>
                    ) : (onlineFriends.has(activeConversation.other_user_id) || activeConversation.is_online === 1) ? (
                      <span className="text-green-500 font-medium">Online</span>
                    ) : (
                      <span>Offline {activeConversation.last_seen ? `• last seen ${formatDate(activeConversation.last_seen)}` : ''}</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Right-side action details */}
              <div className="flex items-center gap-1.5 text-text-secondary">
                <button 
                  className="p-1.5 rounded-lg hover:bg-surface hover:text-text-primary transition-colors cursor-pointer opacity-50 hover:opacity-100"
                  title="Voice Call (V2)"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button 
                  className="p-1.5 rounded-lg hover:bg-surface hover:text-text-primary transition-colors cursor-pointer opacity-50 hover:opacity-100"
                  title="Video Call (V2)"
                >
                  <Video className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => removeFriend(activeConversation.other_user_id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer"
                  title="Remove friend (unfriend)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

            </div>

            {/* Centered conversation column */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto w-full messages-container">
              
              {loadingMessages ? (
                <MessageSkeleton />
              ) : (
                <div className="max-w-[950px] mx-auto w-full px-6 py-5 flex flex-col justify-end min-h-full">
                  
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 opacity-75 animate-fade-in">
                      <div className="p-3 bg-sidebar border border-bordercolor text-brand-500 rounded-xl mb-3 shadow-premium-sm">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <h3 className="text-xs font-bold text-text-primary mb-0.5">Start the conversation</h3>
                      <p className="text-[10px] text-text-secondary text-center max-w-[180px] leading-relaxed">No messages here yet. Say hello to start chatting!</p>
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      const isMine = Number(msg.sender_id) === Number(user.id);
                      
                      // Spacing: group same senders together (cast to number to prevent type string/number mismatches)
                      const isSameSenderAsPrev = index > 0 && Number(messages[index - 1]?.sender_id) === Number(msg.sender_id);
                      const isTimeSeparated = index === 0 || (new Date(msg.created_at) - new Date(messages[index - 1].created_at) > 5 * 60 * 1000);
                      
                      // Group details: Avatar is only shown next to the CHRONOLOGICALLY LAST message in a consecutive group
                      const nextMsg = messages[index + 1];
                      const isSameSenderAsNext = nextMsg && Number(nextMsg.sender_id) === Number(msg.sender_id);
                      const isNextTimeSeparated = nextMsg && (new Date(nextMsg.created_at) - new Date(msg.created_at) > 5 * 60 * 1000);
                      
                      const showAvatar = !isMine && (!isSameSenderAsNext || isNextTimeSeparated);

                      return (
                        <div key={msg.id || index} className="w-full flex flex-col">
                          
                          {/* Centered Date Separation dividers */}
                          {isTimeSeparated && (
                            <div className="flex justify-center my-4 select-none">
                              <span className="px-2.5 py-0.5 text-[8.5px] font-bold text-text-muted uppercase tracking-wider bg-sidebar border border-bordercolor rounded-full shadow-premium-sm">
                                {formatDate(msg.created_at)} • {formatTime(msg.created_at)}
                              </span>
                            </div>
                          )}

                          {/* Message row: Sent has NO avatar on right, Received has avatar/spacer on left */}
                          <div className={`flex items-end gap-2.5 ${isMine ? 'justify-end' : 'justify-start'} ${isSameSenderAsPrev && !isTimeSeparated ? 'mt-0.8' : 'mt-3.5'} group`}>
                            
                            {/* Left Avatar for received messages */}
                            {!isMine && (
                              <div className="w-7 h-7 shrink-0 flex items-center justify-center">
                                {showAvatar ? (
                                  <Avatar 
                                    url={activeConversation.avatar_url} 
                                    name={activeConversation.display_name || activeConversation.username} 
                                    sizeClass="w-7 h-7" 
                                    initialsClass="text-[9.5px]" 
                                  />
                                ) : (
                                  <div className="w-7 h-7 bg-transparent" />
                                )}
                              </div>
                            )}

                            {/* Sent message reaction button (left of bubble) */}
                            {isMine && msg.status !== 'sending' && msg.status !== 'failed' && (
                              <div className="relative shrink-0 select-none">
                                {activeReactionMenuMessageId === msg.id && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-30 cursor-default" 
                                      onClick={() => setActiveReactionMenuMessageId(null)} 
                                    />
                                    <div className="absolute bottom-full mb-2 z-40 bg-sidebar border border-bordercolor shadow-premium-lg rounded-full px-2 py-1.5 flex items-center gap-1.5 animate-scale-in right-0">
                                      {['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '💯'].map(emoji => (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={() => {
                                            toggleMessageReaction(msg.id, emoji);
                                            setActiveReactionMenuMessageId(null);
                                          }}
                                          className="hover:scale-135 active:scale-95 transition-all text-[15px] cursor-pointer select-none p-1 hover:bg-surface rounded-full"
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setActiveReactionMenuMessageId(activeReactionMenuMessageId === msg.id ? null : msg.id)}
                                  className={`opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-surface text-text-secondary hover:text-text-primary cursor-pointer ${activeReactionMenuMessageId === msg.id ? 'opacity-100 text-brand-500 bg-surface' : ''}`}
                                  title="React to message"
                                >
                                  <Smile className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                            {/* Bubble content */}
                            <div className="flex flex-col max-w-[65%] group relative">
                              {msg.message_type === 'image' && msg.attachment ? (
                                <div className="flex flex-col gap-1.5">
                                  {/* Image Container Card */}
                                  <div 
                                    onClick={() => setActiveLightboxImage({
                                      url: msg.attachment.file_url,
                                      name: activeConversation.display_name || activeConversation.username,
                                      caption: msg.message_text
                                    })}
                                    className="relative rounded-xl overflow-hidden border border-bordercolor/60 cursor-zoom-in bg-surface hover:brightness-95 transition-all shadow-sm max-w-sm"
                                    style={{
                                      aspectRatio: (msg.attachment.width && msg.attachment.height) 
                                        ? `${msg.attachment.width} / ${msg.attachment.height}` 
                                        : 'auto',
                                      maxHeight: '260px'
                                    }}
                                  >
                                    <img 
                                      src={msg.attachment.file_url} 
                                      alt="Attachment" 
                                      className="w-full h-full object-cover max-h-[260px]"
                                      loading="lazy"
                                      onLoad={() => {
                                        if (isUserNearBottom()) {
                                          scrollToBottom('instant');
                                        }
                                      }}
                                    />
                                  </div>

                                  {/* Optional Caption */}
                                  {msg.message_text && (
                                    <div 
                                      className={`
                                        px-3.5 py-2 rounded-xl text-[12.5px] leading-relaxed whitespace-pre-wrap break-words max-w-sm
                                        ${isMine 
                                          ? 'bg-sent text-sent-text rounded-tr-none shadow-premium-sm font-medium self-end' 
                                          : 'bg-received text-received-text rounded-tl-none border border-bordercolor font-medium self-start'}
                                      `}
                                    >
                                      {msg.message_text}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                /* Normal text message bubble */
                                <div 
                                  className={`
                                    px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words
                                    ${isMine 
                                      ? 'bg-sent text-sent-text rounded-br-none shadow-premium-sm font-medium' 
                                      : 'bg-received text-received-text rounded-bl-none border border-bordercolor font-medium'}
                                  `}
                                >
                                  {msg.message_text}
                                </div>
                              )}

                              {/* Reactions row (Phase 2) */}
                              {msg.reactions && msg.reactions.length > 0 && (() => {
                                const grouped = {};
                                msg.reactions.forEach(r => {
                                  if (!grouped[r.emoji]) {
                                    grouped[r.emoji] = { count: 0, userIds: new Set() };
                                  }
                                  grouped[r.emoji].count += 1;
                                  grouped[r.emoji].userIds.add(Number(r.userId));
                                });

                                return (
                                  <div className={`flex flex-wrap gap-1 mt-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                                    {Object.entries(grouped).map(([emoji, data]) => {
                                      const isMyReaction = data.userIds.has(Number(user.id));
                                      return (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={() => toggleMessageReaction(msg.id, emoji)}
                                          className={`
                                            inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all select-none border cursor-pointer
                                            ${isMyReaction 
                                              ? 'bg-brand-500/10 border-brand-500/30 text-brand-500 shadow-premium-sm font-semibold' 
                                              : 'bg-surface border-bordercolor text-text-secondary hover:text-text-primary hover:border-bordercolor-hover'}
                                          `}
                                          title={isMyReaction ? "Remove reaction" : "React with this emoji"}
                                        >
                                          <span>{emoji}</span>
                                          <span className="text-[10px]">{data.count}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              
                              {/* Metadata tags */}
                              <div className={`flex items-center gap-1.5 mt-1 text-[8.5px] font-bold ${isMine ? 'justify-end' : 'justify-start'}`}>
                                {msg.status === 'failed' ? (
                                  <button 
                                    onClick={() => retryMessage(msg)}
                                    className="text-red-500 hover:text-red-600 flex items-center gap-1 cursor-pointer underline font-bold"
                                  >
                                    <AlertCircle className="w-3 h-3" />
                                    Failed. Click to retry.
                                  </button>
                                ) : msg.status === 'sending' ? (
                                  <span className="text-text-muted italic flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full border border-t-transparent border-text-muted animate-spin"></span>
                                    Sending...
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-150">{formatTime(msg.created_at)}</span>
                                    {isMine && (
                                      <span>
                                        {msg.is_read === 1 ? (
                                          <CheckCheck className="w-3 h-3 text-brand-500" />
                                        ) : (
                                          <Check className="w-3 h-3 text-text-muted" />
                                        )}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Received message reaction button (right of bubble) */}
                            {!isMine && msg.status !== 'sending' && msg.status !== 'failed' && (
                              <div className="relative shrink-0 select-none">
                                {activeReactionMenuMessageId === msg.id && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-30 cursor-default" 
                                      onClick={() => setActiveReactionMenuMessageId(null)} 
                                    />
                                    <div className="absolute bottom-full mb-2 z-40 bg-sidebar border border-bordercolor shadow-premium-lg rounded-full px-2 py-1.5 flex items-center gap-1.5 animate-scale-in left-0">
                                      {['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '💯'].map(emoji => (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={() => {
                                            toggleMessageReaction(msg.id, emoji);
                                            setActiveReactionMenuMessageId(null);
                                          }}
                                          className="hover:scale-135 active:scale-95 transition-all text-[15px] cursor-pointer select-none p-1 hover:bg-surface rounded-full"
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setActiveReactionMenuMessageId(activeReactionMenuMessageId === msg.id ? null : msg.id)}
                                  className={`opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-surface text-text-secondary hover:text-text-primary cursor-pointer ${activeReactionMenuMessageId === msg.id ? 'opacity-100 text-brand-500 bg-surface' : ''}`}
                                  title="React to message"
                                >
                                  <Smile className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Typing indicator inside column */}
                  {isRecipientTyping && (
                    <div className="flex flex-col gap-1 mt-2.5 animate-fade-in self-start">
                      <span className="text-[10px] text-text-muted ml-9 font-semibold">
                        {recipientDisplayName} is typing...
                      </span>
                      <div className="flex items-center gap-2">
                        <Avatar 
                          url={activeConversation.avatar_url} 
                          name={activeConversation.display_name || activeConversation.username} 
                          sizeClass="w-7 h-7 border border-bordercolor" 
                          initialsClass="text-[9.5px] text-brand-500" 
                        />
                        <div className="bg-received text-received-text border border-bordercolor px-3 py-2 rounded-2xl rounded-bl-none flex items-center gap-1 shadow-premium-sm">
                          <span className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}

            </div>

            {/* Composer/Input: Centers container inside same 950px column */}
            <div className="bg-sidebar border-t border-bordercolor w-full shrink-0 shadow-premium-md">
              <div className="max-w-[950px] mx-auto w-full px-6 py-3">
                
                {/* Floating Image Upload Preview (Phase 2) */}
                {imagePreviewUrl && (
                  <div className="mb-3 p-3 bg-surface border border-bordercolor rounded-2xl flex items-center gap-3 relative animate-slide-up shadow-premium-md">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-bordercolor shrink-0">
                      <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                      {uploadingImage && (
                        <div className="absolute inset-0 bg-dark-950/60 flex items-center justify-center">
                          <span className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                      <span className="text-[10px] font-bold text-brand-500 uppercase tracking-wide">Image Preview</span>
                      <input 
                        type="text" 
                        value={imageCaption}
                        onChange={(e) => setImageCaption(e.target.value)}
                        placeholder="Add a caption (optional)..."
                        disabled={uploadingImage}
                        className="bg-transparent border-none text-xs text-text-primary placeholder:text-text-muted focus:outline-none w-full p-0"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendImage();
                          }
                        }}
                      />
                      {imageError && <span className="text-[10px] text-red-500 font-semibold">{imageError}</span>}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={handleCancelImageUpload}
                        disabled={uploadingImage}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-40"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleSendImage}
                        disabled={uploadingImage}
                        className="p-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-all shadow-premium-sm active:scale-95 cursor-pointer disabled:opacity-40"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Emoji toolbar row */}
                {showEmojiBar && (
                  <div className="flex gap-1.5 items-center mb-2 overflow-x-auto select-none animate-fade-in">
                    <Smile className="w-3.5 h-3.5 text-text-muted shrink-0 mr-1" />
                    {['😀', '😂', '😍', '👍', '🔥', '🎉', '❤️', '🚀', '👀', '💯'].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="px-2 py-0.5 rounded text-[11px] hover:bg-surface active:scale-90 transition-all cursor-pointer text-text-primary font-medium"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input text form bar */}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2.5 bg-surface border border-bordercolor rounded-2xl px-3 py-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                  
                  <button
                    type="button"
                    onClick={() => setShowEmojiBar(!showEmojiBar)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${showEmojiBar ? 'text-brand-500 hover:bg-brand-500/10' : 'text-text-secondary hover:text-text-primary hover:bg-sidebar'}`}
                    title="Toggle Emoji Drawer"
                  >
                    <Smile className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => imageFileInputRef.current?.click()}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-sidebar transition-colors cursor-pointer"
                    title="Upload Image"
                  >
                    <Image className="w-4 h-4" />
                  </button>
                  <input 
                    type="file"
                    ref={imageFileInputRef}
                    onChange={handleImageSelect}
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    className="hidden"
                  />

                  <input
                    type="text"
                    value={messageInput}
                    onChange={handleMessageChange}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none border-none py-1.5 px-1.5 no-transition"
                  />

                  <button
                    type="submit"
                    disabled={!messageInput.trim()}
                    className="p-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white rounded-xl transition-all shadow-premium-sm active:scale-95 shrink-0 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>

                 </form>
                
              </div>
            </div>

            {/* New messages floating badge */}
            {hasNewMessagesBadge && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 animate-bounce">
                <button
                  onClick={() => scrollToBottom('smooth')}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-full shadow-premium-lg border border-brand-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                  New Messages Below
                </button>
              </div>
            )}
          </>
        ) : (
          /* EMPTY STATE: Chat Welcome */
          <div className="flex-1 flex flex-col justify-center items-center p-8 text-center bg-chat bg-dot-pattern/50 relative">
            <div className="max-w-xs animate-slide-up">
              <div className="inline-flex items-center justify-center p-3.5 bg-sidebar border border-bordercolor rounded-2xl shadow-premium-md mb-5">
                <MessageSquare className="w-7 h-7 text-brand-500" />
              </div>

              <h2 className="text-xl font-extrabold text-text-primary mb-1.5 font-plus-jakarta tracking-tight">
                No active chat
              </h2>
              
              <p className="text-xs text-text-secondary mb-5 leading-relaxed max-w-[240px] mx-auto">
                Pick a contact on the left sidebar to start messaging, or open the friends tab to find contacts.
              </p>

              <button
                onClick={() => {
                  setFriendsModalOpen(true);
                  setFriendsActiveTab('list');
                }}
                className="px-4 py-2 bg-sidebar hover:bg-surface text-text-primary font-bold text-xs rounded-xl border border-bordercolor shadow-premium-sm active:scale-95 transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
              >
                <span>Friends list</span>
                <ArrowRight className="w-3.5 h-3.5 text-brand-500" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 3. FRIENDS MODAL */}
      {friendsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-dark-950/40 dark:bg-dark-950/70 backdrop-blur-xs transition-opacity" 
            onClick={() => setFriendsModalOpen(false)}
          />

          <div className="bg-sidebar w-full max-w-lg rounded-2xl overflow-hidden relative z-10 shadow-premium-lg border border-bordercolor animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between p-4.5 border-b border-bordercolor bg-surface/30">
              <h2 className="text-md font-bold font-plus-jakarta text-text-primary flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-brand-500" />
                Friends Management
              </h2>
              <button 
                onClick={() => setFriendsModalOpen(false)}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Nav Tabs */}
            <div className="flex border-b border-bordercolor bg-surface/10">
              <button
                onClick={() => setFriendsActiveTab('search')}
                className={`flex-1 py-2.8 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                  friendsActiveTab === 'search' 
                    ? 'border-brand-500 text-brand-500 bg-surface/30' 
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface/10'
                }`}
              >
                Find Users
              </button>
              <button
                onClick={() => setFriendsActiveTab('pending')}
                className={`flex-1 py-2.8 text-xs font-semibold border-b-2 transition-all relative cursor-pointer ${
                  friendsActiveTab === 'pending' 
                    ? 'border-brand-500 text-brand-500 bg-surface/30' 
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface/10'
                }`}
              >
                Requests
                {pendingRequestsCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-pink-500 text-[9px] text-white font-extrabold shadow shadow-pink-500/20 animate-pulse">
                    {pendingRequestsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setFriendsActiveTab('list')}
                className={`flex-1 py-2.8 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                  friendsActiveTab === 'list' 
                    ? 'border-brand-500 text-brand-500 bg-surface/30' 
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface/10'
                }`}
              >
                Friends ({friends.length})
              </button>
            </div>

            {/* Content List */}
            <div className="p-4 h-80 overflow-y-auto space-y-3 bg-sidebar">
              
              {/* Tab 1: Find users */}
              {friendsActiveTab === 'search' && (
                <div className="space-y-3 h-full flex flex-col">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.8 w-4 h-4 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Type username to search..."
                      value={friendSearchQuery}
                      onChange={(e) => setFriendSearchQuery(e.target.value)}
                      className="w-full premium-input pl-9 pr-4 py-2.2 rounded-xl text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2">
                    {searching ? (
                      <div className="text-center py-12">
                        <div className="w-5 h-5 border-2 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-[11px] text-text-secondary">Searching users list...</p>
                      </div>
                    ) : friendSearchQuery.trim() === '' ? (
                      <div className="text-center py-12 text-text-muted text-xs">
                        Enter a username to search the database
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="text-center py-12 text-text-muted text-xs">
                        No matches found for "{friendSearchQuery}"
                      </div>
                    ) : (
                      searchResults.map(sUser => {
                        const hasSentRequest = sUser.request_status === 'pending' && sUser.request_sender_id === user.id;
                        const hasReceivedRequest = sUser.request_status === 'pending' && sUser.request_sender_id !== user.id;
                        const isFriend = sUser.is_friend === 1;

                        return (
                          <div key={sUser.id} className="flex items-center justify-between p-2 rounded-xl bg-surface/30 border border-bordercolor/80">
                            <div className="flex items-center gap-2.5">
                              <Avatar 
                                url={sUser.avatar_url} 
                                name={sUser.display_name || sUser.username} 
                                sizeClass="w-8 h-8 border border-bordercolor" 
                                initialsClass="text-xs text-brand-500" 
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-text-primary leading-tight truncate max-w-[150px]">{sUser.display_name || sUser.username}</span>
                                <span className="text-[10px] text-text-muted">@{sUser.username}</span>
                              </div>
                            </div>

                            {isFriend ? (
                              <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-lg border border-green-500/20 flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5" />
                                Friends
                              </span>
                            ) : hasSentRequest ? (
                              <span className="text-[10px] font-bold text-text-muted bg-surface px-2.5 py-0.8 rounded-lg border border-bordercolor">
                                Request Sent
                              </span>
                            ) : hasReceivedRequest ? (
                              <button
                                onClick={() => {
                                  const reqItem = requests.received?.find(r => r.sender_id === sUser.id);
                                  if (reqItem) acceptFriendRequest(reqItem.request_id);
                                }}
                                className="px-2.5 py-1 bg-brand-500 hover:bg-brand-600 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                Accept
                              </button>
                            ) : (
                              <button
                                onClick={() => sendFriendRequest(sUser.id)}
                                className="px-2.5 py-1 bg-surface border border-bordercolor hover:bg-surface/50 text-text-primary text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <UserPlus className="w-3 h-3 text-brand-500" />
                                Add Friend
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Pending requests */}
              {friendsActiveTab === 'pending' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[9px] font-bold text-brand-500 uppercase tracking-wider mb-1.5">Received ({requests.received?.length || 0})</h3>
                    {(!requests.received || requests.received.length === 0) ? (
                      <p className="text-[11px] text-text-muted italic py-1">No requests received</p>
                    ) : (
                      requests.received.map(req => (
                        <div key={req.request_id} className="flex items-center justify-between p-2 bg-surface/30 rounded-xl border border-bordercolor/80">
                          <div className="flex items-center gap-2.5">
                            <Avatar 
                              url={req.avatar_url} 
                              name={req.display_name || req.username} 
                              sizeClass="w-8 h-8 border border-bordercolor" 
                              initialsClass="text-xs text-brand-500" 
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-text-primary leading-tight truncate max-w-[150px]">{req.display_name || req.username}</span>
                              <span className="text-[10px] text-text-muted">@{req.username}</span>
                            </div>
                          </div>
                          
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => rejectFriendRequest(req.request_id)}
                              className="px-2 py-0.8 text-[10px] font-bold text-text-secondary hover:text-text-primary bg-surface rounded-lg border border-bordercolor hover:bg-surface/50 transition-colors cursor-pointer"
                            >
                              Ignore
                            </button>
                            <button
                              onClick={() => acceptFriendRequest(req.request_id)}
                              className="px-2.5 py-0.8 text-[10px] font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors cursor-pointer"
                            >
                              Accept
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <hr className="border-bordercolor my-3" />

                  <div>
                    <h3 className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Sent ({requests.sent?.length || 0})</h3>
                    {(!requests.sent || requests.sent.length === 0) ? (
                      <p className="text-[11px] text-text-muted italic py-1">No requests sent</p>
                    ) : (
                      requests.sent.map(req => (
                        <div key={req.request_id} className="flex items-center justify-between p-2 bg-surface/30 rounded-xl border border-bordercolor/80">
                          <div className="flex items-center gap-2.5">
                            <Avatar 
                              url={req.avatar_url} 
                              name={req.display_name || req.username} 
                              sizeClass="w-8 h-8 border border-bordercolor" 
                              initialsClass="text-xs text-brand-500" 
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-text-primary leading-tight truncate max-w-[150px]">{req.display_name || req.username}</span>
                              <span className="text-[10px] text-text-muted">@{req.username}</span>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => rejectFriendRequest(req.request_id)}
                            className="px-2 py-0.8 text-[10px] font-bold text-red-500 hover:bg-red-500/10 rounded-lg border border-red-500/10 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Friends list */}
              {friendsActiveTab === 'list' && (
                <div className="space-y-2">
                  {friends.length === 0 ? (
                    <div className="text-center py-12 text-text-muted text-xs">
                      Find users to build your friends list!
                    </div>
                  ) : (
                    friends.map(friend => {
                      const isOnline = onlineFriends.has(friend.id) || friend.is_online === 1;

                      return (
                        <div key={friend.id} className="flex items-center justify-between p-2 bg-surface/30 rounded-xl border border-bordercolor/80">
                          <div className="flex items-center gap-2.5">
                            <div className="relative shrink-0">
                              <Avatar 
                                url={friend.avatar_url} 
                                name={friend.display_name || friend.username} 
                                sizeClass="w-8 h-8 border border-bordercolor" 
                                initialsClass="text-xs text-brand-500" 
                              />
                              {isOnline && (
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-sidebar"></span>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-text-primary leading-tight truncate max-w-[150px]">{friend.display_name || friend.username}</span>
                              <span className="text-[9.5px] text-text-muted">
                                {isOnline ? 'Online now' : 'Offline'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={async () => {
                                setFriendsModalOpen(false);
                                try {
                                  const res = await fetch('/api/chat/conversations/get-or-create', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      'Authorization': `Bearer ${localStorage.getItem('blinkly_token')}`
                                    },
                                    body: JSON.stringify({ friend_id: friend.id })
                                  });
                                  const data = await res.json();
                                  if (data.conversation_id) {
                                    const matched = conversations.find(c => c.conversation_id === data.conversation_id);
                                    if (matched) {
                                      selectConversation(matched);
                                    } else {
                                      const chatsRes = await fetch('/api/chat/conversations', {
                                        headers: {
                                          'Authorization': `Bearer ${localStorage.getItem('blinkly_token')}`
                                        }
                                      });
                                      const chatsData = await chatsRes.json();
                                      const newC = chatsData.conversations?.find(c => c.conversation_id === data.conversation_id);
                                      if (newC) selectConversation(newC);
                                    }
                                  }
                                } catch (error) {
                                  console.error(error);
                                }
                              }}
                              className="p-1.5 rounded-lg text-brand-500 hover:bg-brand-500/10 transition-colors cursor-pointer"
                              title="Send Message"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            
                            <button
                              onClick={() => removeFriend(friend.id)}
                              className="p-1.5 rounded-lg text-text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Unfriend"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* Admin stats dashboard modal */}
      <AdminPanel isOpen={adminOpen} onClose={() => setAdminOpen(false)} />

      {/* Lightbox / Image Viewer (Phase 2) */}
      {activeLightboxImage && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-center items-center p-4 bg-dark-950/90 backdrop-blur-md animate-fade-in select-none">
          {/* Control bar */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
            <span className="text-xs font-bold text-white tracking-wide">
              Shared by {activeLightboxImage.name}
            </span>
            <button 
              onClick={() => setActiveLightboxImage(null)}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Clickable Backdrop to close */}
          <div className="absolute inset-0" onClick={() => setActiveLightboxImage(null)} />

          {/* Centered Image Card */}
          <div className="relative max-w-full max-h-[75vh] flex items-center justify-center z-10 animate-scale-in">
            <img 
              src={activeLightboxImage.url} 
              alt="Fullscreen View" 
              className="max-w-[90vw] max-h-[75vh] object-contain rounded-lg shadow-premium-lg"
            />
          </div>

          {/* Caption text bar at bottom */}
          {activeLightboxImage.caption && (
            <div className="absolute bottom-6 left-6 right-6 text-center z-10 max-w-md mx-auto">
              <p className="px-4 py-2 bg-white/10 text-white text-xs font-semibold rounded-xl backdrop-blur-xs leading-relaxed inline-block">
                {activeLightboxImage.caption}
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
