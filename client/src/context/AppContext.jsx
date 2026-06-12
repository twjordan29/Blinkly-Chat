import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const AppContext = createContext();

const API_BASE = '/api';
const SOCKET_URL = window.location.origin;

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('blinkly_token') || null);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ received: [], sent: [] });
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineFriends, setOnlineFriends] = useState(new Set());
  const [typingStatus, setTypingStatus] = useState({}); // { [convId]: { [userId]: boolean } }
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const navigate = (to) => {
    window.history.pushState({}, '', to);
    setCurrentPath(to);
  };
  
  // Settings & UX loader variables
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem('blinkly_sound') !== 'false');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [themePreference, setThemePreference] = useState('system');

  // Sync themePreference when user preference loads
  useEffect(() => {
    if (user && user.theme_preference) {
      setThemePreference(user.theme_preference);
    }
  }, [user]);

  // Sync theme class and media listeners based on themePreference
  useEffect(() => {
    const applyTheme = () => {
      const root = window.document.documentElement;
      let activeTheme = themePreference;
      
      if (themePreference === 'system') {
        const isLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        activeTheme = isLight ? 'light' : 'dark';
      }
      
      if (activeTheme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
      }
      setTheme(activeTheme);
      localStorage.setItem('blinkly_theme', activeTheme);
    };

    applyTheme();

    if (themePreference === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [themePreference]);

  const toggleTheme = () => {
    const nextPref = theme === 'dark' ? 'light' : 'dark';
    updateAppearance(nextPref);
  };

  const [loading, setLoading] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  const socketRef = useRef(null);
  const activeConversationRef = useRef(null);
  const typingTimeoutsRef = useRef({}); // { [convId-userId]: timeoutId }

  // Sync activeConversation to ref to avoid stale closures in socket events
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Premium Chime sound using Web Audio API
  const playNotificationSound = (type = 'incoming') => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'incoming') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5
        
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'sent') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
        
        gain.gain.setValueAtTime(0.015, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.06);
      }
    } catch (error) {
      console.error('Web Audio Playback failed:', error);
    }
  };

  // Browser Notification Trigger
  const triggerBrowserNotification = (title, body, iconUrl) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      if (document.hidden) {
        new Notification(title, {
          body,
          icon: iconUrl || '/logo.svg',
          tag: 'blinkly-msg'
        });
      }
    }
  };

  // API Fetch Wrapper
  const apiFetch = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    };

    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Server error occurred');
    }
    return data;
  };

  // Verify Auth token on boot
  useEffect(() => {
    const verifyUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiFetch('/auth/me');
        setUser(data.user);
      } catch (err) {
        console.error('Token verification failed:', err);
        logout();
      } finally {
        setLoading(false);
      }
    };
    verifyUser();
  }, [token]);

  // Connect socket.io on authentication
  useEffect(() => {
    if (!user || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Connect to Socket
    const socket = io(SOCKET_URL, {
      auth: { token }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to chat server');
    });

    socket.on('online_friends', (friendIds) => {
      setOnlineFriends(new Set(friendIds));
    });

    socket.on('friend_status', ({ userId, isOnline }) => {
      setOnlineFriends(prev => {
        const next = new Set(prev);
        if (isOnline) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });

      // Update friendship list in-place
      setFriends(prev => prev.map(f => {
        if (f.id === userId) {
          return { ...f, is_online: isOnline ? 1 : 0, last_seen: new Date().toISOString() };
        }
        return f;
      }));
    });

    // Real-time Friend Request Received
    socket.on('friend_request_received', (reqData) => {
      setRequests(prev => ({
        ...prev,
        received: [reqData, ...(prev.received || [])]
      }));
      playNotificationSound('incoming');
      triggerBrowserNotification('New Friend Request', `${reqData.display_name} sent you a friend request!`);
    });

    // Real-time Friend Request Accepted
    socket.on('friend_request_accepted', ({ request_id, conversation_id, accepted_by, sent_by }) => {
      // Remove from pending
      setRequests(prev => ({
        received: (prev.received || []).filter(r => r.request_id !== request_id),
        sent: (prev.sent || []).filter(r => r.request_id !== request_id)
      }));

      // Reload friends list and conversation sidebar immediately
      apiFetch('/friends').then(data => setFriends(data.friends)).catch(err => console.error(err));
      apiFetch('/chat/conversations').then(data => setConversations(data.conversations)).catch(err => console.error(err));
      playNotificationSound('incoming');
    });

    // Real-time Friend List Updates (Ignore request / reject / unfriend)
    socket.on('friend_list_updated', ({ type, friend_id, request_id }) => {
      apiFetch('/friends').then(data => setFriends(data.friends)).catch(err => console.error(err));
      apiFetch('/chat/conversations').then(data => setConversations(data.conversations)).catch(err => console.error(err));
      apiFetch('/friends/requests').then(data => setRequests(data)).catch(err => console.error(err));

      const activeConv = activeConversationRef.current;
      if (type === 'remove' && activeConv && activeConv.other_user_id === parseInt(friend_id)) {
        setActiveConversation(null);
        setMessages([]);
      }
    });

    // Handle incoming messages
    const handleReceiveMessage = (msg) => {
      const activeConv = activeConversationRef.current;
      
      // If message is in the open chat
      if (activeConv && activeConv.conversation_id === msg.conversation_id) {
        setMessages(prev => {
          // If we already have this message ID, ignore
          if (prev.some(m => m.id === msg.id)) return prev;

          // If we have an optimistic message with matching client_msg_id, replace it
          if (msg.client_msg_id) {
            const optIdx = prev.findIndex(m => m.id === msg.client_msg_id);
            if (optIdx > -1) {
              const next = [...prev];
              next[optIdx] = { ...msg, status: 'sent' };
              return next;
            }
          }

          // If we have an optimistic message matching text and sender is us, replace it
          if (msg.sender_id === user.id) {
            const optIdx = prev.findIndex(m => (m.status === 'sending' || m.status === 'failed') && m.message_text === msg.message_text);
            if (optIdx > -1) {
              const next = [...prev];
              next[optIdx] = { ...msg, status: 'sent' };
              return next;
            }
          }
          return [...prev, { ...msg, status: 'sent' }];
        });

        // Acknowledge read receipt
        if (msg.sender_id !== user.id) {
          socket.emit('read_receipt', {
            conversation_id: msg.conversation_id,
            sender_id: msg.sender_id
          });
          
          apiFetch(`/chat/conversations/${msg.conversation_id}/read`, { method: 'POST' })
            .catch(err => console.error(err));

          playNotificationSound('incoming');
        }
      }

      // Always update conversation list snippet and sort to top
      setConversations(prev => {
        const conversationExists = prev.some(c => c.conversation_id === msg.conversation_id);
        
        const updateMapping = prev.map(c => {
          if (c.conversation_id === msg.conversation_id) {
            return {
              ...c,
              last_message: msg.message_text,
              last_message_sender_id: msg.sender_id,
              last_message_time: msg.created_at,
              unread_count: (activeConv?.conversation_id === msg.conversation_id || msg.sender_id === user.id) 
                ? c.unread_count 
                : c.unread_count + 1
            };
          }
          return c;
        });

        if (!conversationExists) {
          // Trigger a refresh to pull the new conversation entity (occurs if first message starts a conversation)
          apiFetch('/chat/conversations').then(data => setConversations(data.conversations)).catch(err => console.error(err));
          return prev;
        }

        return [...updateMapping].sort((a, b) => new Date(b.last_message_time || b.updated_at) - new Date(a.last_message_time || a.updated_at));
      });

      // Browser push notification
      if (msg.sender_id !== user.id && (!activeConv || activeConv.conversation_id !== msg.conversation_id)) {
        playNotificationSound('incoming');
        const senderConv = conversations.find(c => c.conversation_id === msg.conversation_id);
        const senderName = senderConv ? senderConv.display_name : 'New Message';
        triggerBrowserNotification(senderName, msg.message_text, senderConv?.avatar_url);
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_received', handleReceiveMessage);

    // Typing Indicators Start Real-Time (Phase 2)
    socket.on('typing_start', ({ conversationId, userId, displayName }) => {
      const key = `${conversationId}-${userId}`;
      if (typingTimeoutsRef.current[key]) {
        clearTimeout(typingTimeoutsRef.current[key]);
      }

      setTypingStatus(prev => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] || {}),
          [userId]: { isTyping: true, displayName }
        }
      }));

      typingTimeoutsRef.current[key] = setTimeout(() => {
        setTypingStatus(prev => {
          const nextConv = { ...(prev[conversationId] || {}) };
          delete nextConv[userId];
          return { ...prev, [conversationId]: nextConv };
        });
        delete typingTimeoutsRef.current[key];
      }, 3000);
    });

    // Typing Indicators Stop Real-Time (Phase 2)
    socket.on('typing_stop', ({ conversationId, userId }) => {
      const key = `${conversationId}-${userId}`;
      if (typingTimeoutsRef.current[key]) {
        clearTimeout(typingTimeoutsRef.current[key]);
        delete typingTimeoutsRef.current[key];
      }

      setTypingStatus(prev => {
        const nextConv = { ...(prev[conversationId] || {}) };
        delete nextConv[userId];
        return {
          ...prev,
          [conversationId]: nextConv
        };
      });
    });

    // Read Receipt updates
    socket.on('read_receipt_update', ({ conversation_id, reader_id }) => {
      const activeConv = activeConversationRef.current;
      if (activeConv && activeConv.conversation_id === conversation_id) {
        setMessages(prev => prev.map(m => {
          if (m.sender_id === user.id) {
            return { ...m, is_read: 1 };
          }
          return m;
        }));
      }
    });

    // Real-time reactions updates (Phase 2)
    socket.on('message_reaction_updated', ({ messageId, conversationId, reactions }) => {
      const activeConv = activeConversationRef.current;
      if (activeConv && activeConv.conversation_id === conversationId) {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            return { ...m, reactions };
          }
          return m;
        }));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, conversations]);

  // Load friends and conversations when user is logged in
  useEffect(() => {
    if (!user) return;

    const loadAppData = async () => {
      setLoadingConversations(true);
      try {
        const [friendsData, requestsData, chatsData] = await Promise.all([
          apiFetch('/friends'),
          apiFetch('/friends/requests'),
          apiFetch('/chat/conversations')
        ]);
        setFriends(friendsData.friends);
        setRequests(requestsData);
        setConversations(chatsData.conversations);

        // Check for conversation_id in query params
        const params = new URLSearchParams(window.location.search);
        const queryConvId = params.get('conversation_id');
        if (queryConvId) {
          const conv = chatsData.conversations.find(c => c.conversation_id === parseInt(queryConvId));
          if (conv) {
            selectConversation(conv);
            // Clean up the URL query params without reloading
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } catch (error) {
        console.error('Error loading initial app data:', error);
      } finally {
        setLoadingConversations(false);
      }
    };

    loadAppData();
  }, [user]);

  // Select a conversation and load history
  const selectConversation = async (conv) => {
    setActiveConversation(conv);
    if (!conv) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      // Load message history
      const { messages: history } = await apiFetch(`/chat/conversations/${conv.conversation_id}/messages`);
      setMessages(history.map(m => ({ ...m, status: 'sent' })));
      
      // Clear unread count locally
      setConversations(prev => prev.map(c => {
        if (c.conversation_id === conv.conversation_id) {
          return { ...c, unread_count: 0 };
        }
        return c;
      }));

      // Fire read receipt
      if (conv.unread_count > 0) {
        await apiFetch(`/chat/conversations/${conv.conversation_id}/read`, { method: 'POST' });
        if (socketRef.current) {
          socketRef.current.emit('read_receipt', {
            conversation_id: conv.conversation_id,
            sender_id: conv.other_user_id
          });
        }
      }
    } catch (err) {
      console.error('Error loading conversation history:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Send message - OPTIMISTIC UI IMPLEMENTATION
  const sendMessage = (messageText) => {
    if (!activeConversation || !messageText.trim() || !socketRef.current) return;
    
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    
    // Create optimistic message object
    const optimisticMsg = {
      id: tempId,
      conversation_id: activeConversation.conversation_id,
      sender_id: user.id,
      message_text: messageText.trim(),
      is_read: 0,
      created_at: new Date().toISOString(),
      status: 'sending' // custom client status 'sending' | 'sent' | 'failed'
    };

    // 1. Immediately append to message stream
    setMessages(prev => [...prev, optimisticMsg]);
    playNotificationSound('sent');

    // 2. Immediately float conversation item in sidebar to top and update preview text
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.conversation_id === activeConversation.conversation_id) {
          return {
            ...c,
            last_message: optimisticMsg.message_text,
            last_message_sender_id: user.id,
            last_message_time: optimisticMsg.created_at
          };
        }
        return c;
      });
      return [...updated].sort((a, b) => new Date(b.last_message_time || b.updated_at) - new Date(a.last_message_time || a.updated_at));
    });

    const payload = {
      conversation_id: activeConversation.conversation_id,
      receiver_id: activeConversation.other_user_id,
      message_text: optimisticMsg.message_text,
      client_msg_id: tempId
    };

    // Track response acknowledgment
    let resolved = false;

    socketRef.current.emit('send_message', payload, (response) => {
      resolved = true;

      if (response && response.success) {
        // Replace optimistic temp message with database message
        setMessages(prev => prev.map(m => m.id === tempId || m.client_msg_id === tempId ? { ...response.message, status: 'sent' } : m));
        
        // Sync timestamp on the sidebar
        setConversations(prev => {
          return prev.map(c => {
            if (c.conversation_id === activeConversation.conversation_id) {
              return {
                ...c,
                last_message_time: response.message.created_at
              };
            }
            return c;
          }).sort((a, b) => new Date(b.last_message_time || b.updated_at) - new Date(a.last_message_time || a.updated_at));
        });
      } else {
        // Mark failed
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      }
    });

    // 5-second failure timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      }
    }, 5000);
  };

  // Retry sending a failed message
  const retryMessage = (failedMsg) => {
    if (!socketRef.current) return;

    // Put status back to sending
    setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'sending' } : m));

    const payload = {
      conversation_id: failedMsg.conversation_id,
      receiver_id: activeConversation.other_user_id,
      message_text: failedMsg.message_text,
      client_msg_id: failedMsg.id
    };

    let resolved = false;

    socketRef.current.emit('send_message', payload, (response) => {
      resolved = true;

      if (response && response.success) {
        // Replace temp failed message with real database entity
        setMessages(prev => prev.map(m => m.id === failedMsg.id || m.client_msg_id === failedMsg.id ? { ...response.message, status: 'sent' } : m));
        playNotificationSound('sent');
      } else {
        setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'failed' } : m));
      }
    });

    // Timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'failed' } : m));
      }
    }, 5000);
  };

  // Send image message - PHASE 2 IMPLEMENTATION
  const sendImageMessage = async (conversationId, file, caption = '') => {
    const formData = new FormData();
    formData.append('image', file);
    if (caption) {
      formData.append('caption', caption);
    }

    const data = await apiFetch(`/chat/conversations/${conversationId}/messages/image`, {
      method: 'POST',
      body: formData
    });

    if (data && data.success) {
      // Append message if not already present
      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) return prev;
        return [...prev, { ...data.message, status: 'sent' }];
      });
      playNotificationSound('sent');

      // Update sidebar
      setConversations(prev => {
        const updated = prev.map(c => {
          if (c.conversation_id === conversationId) {
            return {
              ...c,
              last_message: data.message.message_text || 'Photo',
              last_message_sender_id: user.id,
              last_message_time: data.message.created_at
            };
          }
          return c;
        });
        return [...updated].sort((a, b) => new Date(b.last_message_time || b.updated_at) - new Date(a.last_message_time || a.updated_at));
      });

      return data.message;
    } else {
      throw new Error(data.error || 'Failed to upload image');
    }
  };

  // Broadcast typing start (Phase 2)
  const sendTypingStart = (conversationId, receiverId) => {
    if (!socketRef.current) return;
    socketRef.current.emit('typing_start', {
      conversation_id: conversationId,
      receiver_id: receiverId
    });
  };

  // Broadcast typing stop (Phase 2)
  const sendTypingStop = (conversationId, receiverId) => {
    if (!socketRef.current) return;
    socketRef.current.emit('typing_stop', {
      conversation_id: conversationId,
      receiver_id: receiverId
    });
  };

  // Toggle message reaction (Phase 2)
  const toggleMessageReaction = async (messageId, emoji) => {
    try {
      const data = await apiFetch(`/chat/messages/${messageId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji })
      });
      if (data && data.success) {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            return { ...m, reactions: data.reactions };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error('Error toggling message reaction:', err);
    }
  };

  // Actions
  const login = async (usernameOrEmail, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail, password })
    });
    localStorage.setItem('blinkly_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (username, email, password, displayName) => {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, display_name: displayName })
    });
    localStorage.setItem('blinkly_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('blinkly_token');
    setToken(null);
    setUser(null);
    setFriends([]);
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setOnlineFriends(new Set());
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const updateProfile = async (displayName) => {
    const data = await apiFetch('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ display_name: displayName })
    });
    setUser(data.user);
  };

  const uploadAvatar = async (formData) => {
    const data = await apiFetch('/auth/avatar', {
      method: 'POST',
      body: formData
    });
    setUser(prev => ({ ...prev, avatar_url: data.avatar_url }));
    return data.avatar_url;
  };

  // Settings: Update profile fields
  const updateMeProfile = async (profileData) => {
    const data = await apiFetch('/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(profileData)
    });
    if (data && data.success) {
      setUser(data.user);
      return data.user;
    } else {
      throw new Error(data.error || 'Failed to update profile');
    }
  };

  // Settings: Upload avatar
  const uploadMeAvatar = async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const data = await apiFetch('/me/avatar', {
      method: 'POST',
      body: formData
    });
    if (data && data.success) {
      setUser(prev => prev ? { ...prev, avatar_url: data.avatar_url } : null);
      return data.avatar_url;
    } else {
      throw new Error(data.error || 'Failed to upload avatar');
    }
  };

  // Settings: Reset avatar
  const deleteMeAvatar = async () => {
    const data = await apiFetch('/me/avatar', {
      method: 'DELETE'
    });
    if (data && data.success) {
      setUser(prev => prev ? { ...prev, avatar_url: null } : null);
      return null;
    } else {
      throw new Error(data.error || 'Failed to delete avatar');
    }
  };

  // Settings: Update theme preference
  const updateAppearance = async (pref) => {
    try {
      const data = await apiFetch('/me/appearance', {
        method: 'PATCH',
        body: JSON.stringify({ theme_preference: pref })
      });
      if (data && data.success) {
        setThemePreference(pref);
        setUser(prev => prev ? { ...prev, theme_preference: pref } : null);
      }
    } catch (err) {
      console.error('Failed to update appearance:', err);
    }
  };

  const sendFriendRequest = async (receiverId) => {
    await apiFetch('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: receiverId })
    });
    const requestsData = await apiFetch('/friends/requests');
    setRequests(requestsData);
  };

  const acceptFriendRequest = async (requestId) => {
    const res = await apiFetch('/friends/request/accept', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId })
    });
    
    const [friendsData, requestsData, chatsData] = await Promise.all([
      apiFetch('/friends'),
      apiFetch('/friends/requests'),
      apiFetch('/chat/conversations')
    ]);
    
    setFriends(friendsData.friends);
    setRequests(requestsData);
    setConversations(chatsData.conversations);

    if (res.conversation_id) {
      const newConv = chatsData.conversations.find(c => c.conversation_id === res.conversation_id);
      if (newConv) {
        selectConversation(newConv);
      }
    }
  };

  const rejectFriendRequest = async (requestId) => {
    await apiFetch('/friends/request/reject', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId })
    });
    const requestsData = await apiFetch('/friends/requests');
    setRequests(requestsData);
  };

  const removeFriend = async (friendId) => {
    await apiFetch(`/friends/${friendId}`, { method: 'DELETE' });
    
    const [friendsData, chatsData] = await Promise.all([
      apiFetch('/friends'),
      apiFetch('/chat/conversations')
    ]);
    
    setFriends(friendsData.friends);
    setConversations(chatsData.conversations);
    
    if (activeConversation && activeConversation.other_user_id === parseInt(friendId)) {
      setActiveConversation(null);
      setMessages([]);
    }
  };

  const fetchAdminStats = async () => {
    if (!user?.is_admin) return null;
    return await apiFetch('/admin/stats');
  };

  const toggleSound = (enabled) => {
    setSoundEnabled(enabled);
    localStorage.setItem('blinkly_sound', enabled);
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  };

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallAvailable, setIsInstallAvailable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallAvailable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(Boolean(isStandaloneMode));

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const triggerInstallPrompt = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallAvailable(false);
  };

  // Push notification permissions state
  const [pushPermissionState, setPushPermissionState] = useState('Default');
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const updatePushPermissionState = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushPermissionState('Unsupported');
      setIsPushSubscribed(false);
      return;
    }

    const permission = Notification.permission;
    if (permission === 'default') {
      setPushPermissionState('Default');
    } else if (permission === 'granted') {
      setPushPermissionState('Granted');
    } else if (permission === 'denied') {
      setPushPermissionState('Denied');
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsPushSubscribed(!!subscription);
    } catch (err) {
      console.warn('Error checking push subscription state:', err);
      setIsPushSubscribed(false);
    }
  };

  useEffect(() => {
    updatePushPermissionState();
  }, [user]);

  const subscribeToPushNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('Push notifications are not supported in this browser.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      updatePushPermissionState();
      throw new Error('Notification permission was denied.');
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      const { publicKey } = await apiFetch('/push/vapid-key');
      if (!publicKey) {
        throw new Error('VAPID public key not found on server');
      }

      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      const subJson = subscription.toJSON();
      
      await apiFetch('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth
          }
        })
      });

      await updatePushPermissionState();
      return true;
    } catch (err) {
      console.error('Failed to subscribe to push notifications:', err);
      await updatePushPermissionState();
      throw err;
    }
  };

  const unsubscribeFromPushNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiFetch('/push/unsubscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
      }
      await updatePushPermissionState();
      return true;
    } catch (err) {
      console.error('Failed to unsubscribe from push notifications:', err);
      await updatePushPermissionState();
      throw err;
    }
  };

  // SW SELECT_CONVERSATION Event Listener
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleServiceWorkerMessage = (event) => {
        if (event.data && event.data.type === 'SELECT_CONVERSATION') {
          const { conversationId } = event.data;
          console.log('Received SELECT_CONVERSATION from SW:', conversationId);
          if (conversations && conversations.length > 0) {
            const conv = conversations.find(c => c.conversation_id === parseInt(conversationId));
            if (conv) {
              selectConversation(conv);
              navigate('/');
            } else {
              apiFetch('/chat/conversations')
                .then(data => {
                  setConversations(data.conversations);
                  const found = data.conversations.find(c => c.conversation_id === parseInt(conversationId));
                  if (found) {
                    selectConversation(found);
                    navigate('/');
                  }
                })
                .catch(err => console.error('Failed to reload conversations for SW selection:', err));
            }
          } else {
            apiFetch('/chat/conversations')
              .then(data => {
                setConversations(data.conversations);
                const found = data.conversations.find(c => c.conversation_id === parseInt(conversationId));
                if (found) {
                  selectConversation(found);
                  navigate('/');
                }
              })
              .catch(err => console.error('Failed to load conversations for SW selection:', err));
          }
        }
      };

      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
  }, [conversations]);

  return (
    <AppContext.Provider value={{
      user,
      token,
      friends,
      requests,
      conversations,
      activeConversation,
      messages,
      onlineFriends,
      typingStatus,
      soundEnabled,
      notificationsEnabled,
      theme,
      toggleTheme,
      loading,
      loadingConversations,
      loadingMessages,
      login,
      register,
      logout,
      updateProfile,
      uploadAvatar,
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
      toggleMessageReaction,
      fetchAdminStats,
      toggleSound,
      requestNotificationPermission,
      playNotificationSound,
      currentPath,
      navigate,
      themePreference,
      updateMeProfile,
      uploadMeAvatar,
      deleteMeAvatar,
      updateAppearance,
      deferredPrompt,
      isInstallAvailable,
      isStandalone,
      triggerInstallPrompt,
      pushPermissionState,
      isPushSubscribed,
      subscribeToPushNotifications,
      unsubscribeFromPushNotifications,
      updatePushPermissionState
    }}>
      {children}
    </AppContext.Provider>
  );
};
