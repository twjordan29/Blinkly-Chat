import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Image, Send, Smile } from 'lucide-react';

export function Button({ variant = 'primary', className = '', loading = false, children, ...props }) {
  const variantClass = {
    primary: 'premium-btn-primary',
    secondary: 'premium-btn-secondary',
    danger: 'premium-btn-danger',
    ghost: 'premium-btn-ghost'
  }[variant] || 'premium-btn-primary';

  return (
    <button className={`premium-btn ${variantClass} ${className}`} disabled={loading || props.disabled} {...props}>
      {children}
    </button>
  );
}

export function IconButton({ className = '', active = false, children, ...props }) {
  return (
    <button className={`premium-icon-btn touch-target ${active ? 'premium-icon-btn-active' : ''} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function TextInput({ icon: Icon, className = '', ...props }) {
  return (
    <div className="premium-input-wrapper">
      {Icon && (
        <div className="premium-input-icon left-3.5">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <input className={`premium-input ${Icon ? 'premium-input-with-icon-left' : ''} ${className}`} {...props} />
    </div>
  );
}

export function PasswordInput({ className = '', ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="premium-input-wrapper">
      <input
        type={show ? 'text' : 'password'}
        className={`premium-input premium-input-with-icon-right ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow(value => !value)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted hover:text-text-primary"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function TextArea({ className = '', ...props }) {
  return <textarea className={`premium-textarea ${className}`} {...props} />;
}

export function Avatar({ url, name, sizeClass = 'w-10 h-10', initialsClass = 'text-xs' }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => setHasError(false), [url]);

  const initials = name ? name.substring(0, 2).toUpperCase() : '??';
  const invalid = !url || url === 'null' || url === 'undefined' || String(url).includes('null') || String(url).includes('undefined');

  if (invalid || hasError) {
    return (
      <div className={`${sizeClass} rounded-full bg-accent flex items-center justify-center text-white ${initialsClass} font-bold select-none shrink-0`}>
        {initials}
      </div>
    );
  }

  return <img src={url} alt={name || 'Avatar'} onError={() => setHasError(true)} className={`${sizeClass} rounded-full object-cover shrink-0`} />;
}

export function Badge({ className = '', children }) {
  return <span className={`premium-badge ${className}`}>{children}</span>;
}

export function Card({ className = '', children, ...props }) {
  return <div className={`premium-card ${className}`} {...props}>{children}</div>;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="premium-empty-state">
      {Icon && (
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-bordercolor bg-sidebar text-accent shadow-premium-sm">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h2 className="text-base font-extrabold text-text-primary">{title}</h2>
      {children && <div className="mt-2 max-w-xs text-sm leading-relaxed text-text-secondary">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SettingsNavItem({ active, icon: Icon, children, className = '', ...props }) {
  return (
    <button className={`settings-nav-item ${active ? 'settings-nav-item-active' : ''} ${className}`} {...props}>
      {Icon && <Icon className={`w-4 h-4 ${active ? 'text-accent' : 'text-text-secondary'}`} />}
      <span>{children}</span>
    </button>
  );
}

export function ChatBubble({ mine, children, className = '' }) {
  return (
    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${mine ? 'bg-sent text-sent-text rounded-br-md shadow-premium-sm' : 'bg-received text-received-text rounded-bl-md border border-bordercolor'} ${className}`}>
      {children}
    </div>
  );
}

export function ChatComposer({ value, onChange, onSubmit, onEmoji, onImage, disabled }) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-12 items-center gap-1.5 rounded-2xl border border-bordercolor bg-surface px-2 py-1 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
      <IconButton type="button" onClick={onEmoji} title="Emoji">
        <Smile className="w-4 h-4" />
      </IconButton>
      <IconButton type="button" onClick={onImage} title="Upload image">
        <Image className="w-4 h-4" />
      </IconButton>
      <input value={value} onChange={onChange} placeholder="Type a message..." className="min-w-0 flex-1 border-none bg-transparent px-2 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted no-transition" />
      <button type="submit" disabled={disabled} className="touch-target flex items-center justify-center rounded-xl bg-accent text-white shadow-premium-sm disabled:opacity-40">
        <Send className="w-4 h-4" />
      </button>
    </form>
  );
}

export function MobileHeader({ title, subtitle, left, right }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-bordercolor bg-sidebar px-3 shadow-premium-sm">
      <div className="flex min-w-0 items-center gap-2">
        {left}
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold text-text-primary">{title}</div>
          {subtitle && <div className="truncate text-[11px] text-text-muted">{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function SidebarConversationItem({ active, unread, children, className = '', ...props }) {
  return (
    <button className={`conversation-item relative flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.99] ${active ? 'border-bordercolor bg-surface shadow-premium-sm ring-1 ring-accent/10' : 'border-transparent hover:bg-surface/60'} ${unread ? 'font-bold' : ''} ${className}`} {...props}>
      {children}
    </button>
  );
}
