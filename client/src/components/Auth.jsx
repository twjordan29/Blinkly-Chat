import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquare, Lock, Mail, User, Sparkles, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function Auth() {
  const { login, register } = useApp();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        if (!username || !password) {
          throw new Error('Please enter username/email and password');
        }
        await login(username, password);
      } else {
        if (!username || !email || !password) {
          throw new Error('Please fill in all required fields');
        }
        await register(username, email, password, displayName);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center p-4 relative overflow-hidden transition-colors duration-300">
      
      {/* Subtle background mesh effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/3 rounded-full blur-3xl -z-10 animate-pulse-slow"></div>
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-pink-500/2 rounded-full blur-3xl -z-10 animate-pulse-slow" style={{ animationDelay: '1.5s' }}></div>

      {/* Main Container */}
      <div className="w-full max-w-sm animate-scale-in">
        
        {/* Logo & Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-sidebar border border-bordercolor rounded-2xl shadow-premium-md mb-4.5">
            <MessageSquare className="w-6 h-6 text-brand-600" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary mb-1.5 font-plus-jakarta">
            Blinkly<span className="text-brand-500">.chat</span>
          </h1>
          <p className="text-text-secondary text-xs">
            {isLogin ? 'Welcome back! Connect in real-time.' : 'Create an account to begin chatting.'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-sidebar border border-bordercolor rounded-2xl p-6 shadow-premium-lg relative overflow-hidden">
          
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-start gap-2 animate-scale-in">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username / Email field for Login or Username for Register */}
            <div>
              <label className="block text-text-secondary text-xs font-semibold mb-1.5 uppercase tracking-wider">
                {isLogin ? 'Username or Email' : 'Username'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder={isLogin ? "enter username or email" : "choose a username"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="premium-input w-full pl-10 pr-4 py-2.8 rounded-xl text-xs placeholder:text-text-muted focus:outline-none"
                />
              </div>
            </div>

            {/* Email Field - Register only */}
            {!isLogin && (
              <div className="animate-fade-in">
                <label className="block text-text-secondary text-xs font-semibold mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="premium-input w-full pl-10 pr-4 py-2.8 rounded-xl text-xs placeholder:text-text-muted focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Display Name Field - Register only */}
            {!isLogin && (
              <div className="animate-fade-in">
                <label className="block text-text-secondary text-xs font-semibold mb-1.5 uppercase tracking-wider">
                  Display Name <span className="text-text-muted font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="premium-input w-full pl-10 pr-4 py-2.8 rounded-xl text-xs placeholder:text-text-muted focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Password Field */}
            <div>
              <label className="block text-text-secondary text-xs font-semibold mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="premium-input w-full pl-10 pr-11 py-2.8 rounded-xl text-xs placeholder:text-text-muted focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2.5 py-2.8 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 shadow-premium-sm active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Toggle Link */}
          <div className="mt-5 text-center text-xs">
            <span className="text-text-secondary">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setUsername('');
                setEmail('');
                setPassword('');
                setDisplayName('');
              }}
              className="text-brand-500 font-bold hover:underline transition-colors ml-0.5 cursor-pointer"
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </div>

        </div>

        {/* Footer */}
        <p className="text-center text-[10.5px] text-text-muted mt-5 tracking-wide">
          Secure JWT authentication &bull; Real-time delivery &bull; Blinkly V1
        </p>

      </div>
    </div>
  );
}
