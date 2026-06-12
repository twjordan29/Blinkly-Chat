import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';

function MainApp() {
  const { user, loading, currentPath } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col justify-center items-center gap-4">
        {/* Premium spinner element */}
        <div className="w-10 h-10 border-2 border-brand-500/20 border-t-brand-500 rounded-full animate-spin"></div>
        <p className="text-xs text-dark-400 font-semibold tracking-wider uppercase animate-pulse">Initializing Blinkly...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (currentPath === '/settings') {
    return <Settings />;
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
