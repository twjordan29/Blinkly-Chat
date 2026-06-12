import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, Users, MessageSquare, ShieldCheck, RefreshCw, Activity } from 'lucide-react';

export default function AdminPanel({ isOpen, onClose }) {
  const { fetchAdminStats, user } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminStats();
      if (data) {
        setStats(data);
      } else {
        setError('Unauthorized access or failed to load statistics.');
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch admin statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && user?.is_admin) {
      loadStats();
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-dark-950/40 dark:bg-dark-950/70 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="bg-sidebar w-full max-w-2xl rounded-2xl overflow-hidden relative z-10 shadow-premium-lg border border-bordercolor animate-scale-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-bordercolor bg-surface/30">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-accent/10 rounded-lg border border-accent/20 text-accent">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-md font-bold font-plus-jakarta text-text-primary">Admin Panel</h2>
              <p className="text-[10px] text-text-secondary mt-0.5">Real-time status overview of Blinkly.chat</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={loadStats} 
              disabled={loading}
              className="w-8 h-8 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={onClose} 
              className="w-8 h-8 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer flex items-center justify-center"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl">
              {error}
            </div>
          )}

          {loading && !stats ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2.5">
              <RefreshCw className="w-6 h-6 text-accent animate-spin" />
              <p className="text-xs text-text-secondary font-semibold animate-pulse">Loading live app statistics...</p>
            </div>
          ) : (
            <div className="space-y-5">
              
              {/* Stat Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Total Users */}
                <div className="bg-surface p-4.5 rounded-xl border border-bordercolor relative overflow-hidden group shadow-premium-sm">
                  <div className="text-2xl font-black text-text-primary font-plus-jakarta">{stats?.total_users || 0}</div>
                  <div className="text-[10.5px] text-text-secondary mt-1 font-bold">Registered Accounts</div>
                </div>

                {/* Total Messages */}
                <div className="bg-surface p-4.5 rounded-xl border border-bordercolor relative overflow-hidden group shadow-premium-sm">
                  <div className="text-2xl font-black text-text-primary font-plus-jakarta">{stats?.total_messages || 0}</div>
                  <div className="text-[10.5px] text-text-secondary mt-1 font-bold">Total Messages Sent</div>
                </div>

                {/* Online Users */}
                <div className="bg-surface p-4.5 rounded-xl border border-bordercolor relative overflow-hidden group shadow-premium-sm">
                  <div className="text-2xl font-black text-text-primary font-plus-jakarta">{stats?.online_users || 0}</div>
                  <div className="text-[10.5px] text-text-secondary mt-1 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Users Online
                  </div>
                </div>

              </div>

              {/* Service Health Details */}
              <div className="bg-surface p-4.5 rounded-xl border border-bordercolor shadow-premium-sm">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-primary mb-3">Service Health Status</h3>
                <div className="space-y-2.5 text-xs text-text-secondary">
                  <div className="flex justify-between items-center py-1.5 border-b border-bordercolor">
                    <span>Database Engine</span>
                    <span className="font-bold text-text-primary">MariaDB v10+ (Pool Active)</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-bordercolor">
                    <span>WS Connection Service</span>
                    <span className="font-bold text-text-primary">Socket.IO Engine (WS/WSS)</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-bordercolor">
                    <span>Node Backend Runtime</span>
                    <span className="font-bold text-text-primary">NodeJS (ES Modules)</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span>PM2 Process Manager</span>
                    <span className="font-bold text-green-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                      Deployment Ready
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-1">
            <button
              onClick={onClose}
              className="premium-btn premium-btn-secondary"
            >
              Close Panel
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
