import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle2 } from 'lucide-react';
import { getNotifications, markNotificationAsRead } from '../api/apiService';
import { Notification } from '../types';

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      const res = await getNotifications();
      if (res.data) setNotifications(res.data);
      setLoading(false);
    };
    fetchNotifications();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    await markNotificationAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    await Promise.all(unread.map(n => markNotificationAsRead(n.id)));
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        className="relative text-text-muted hover:text-primary transition-colors p-1"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-error rounded-full border-2 border-surface"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface border border-text-muted/10 rounded-2xl shadow-lg z-50 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-text-muted/10 flex items-center justify-between bg-base/50">
            <h3 className="font-semibold text-text-main">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="text-xs text-primary font-medium hover:text-primary/80 transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-text-muted animate-pulse">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">You have no notifications.</div>
            ) : (
              <div className="flex flex-col divide-y divide-text-muted/5">
                {notifications.map(n => (
                  <div 
                    key={n.id} 
                    className={`p-4 flex gap-3 hover:bg-base/50 transition-colors cursor-pointer ${
                      !n.isRead ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => !n.isRead && handleMarkAsRead(n.id)}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${!n.isRead ? 'bg-primary' : 'bg-transparent'}`}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${!n.isRead ? 'text-text-main' : 'text-text-muted'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-text-muted mt-1 leading-snug">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-text-muted/60 mt-2 uppercase tracking-wide">
                        {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', month: 'short', day: 'numeric' }).format(new Date(n.createdAt))}
                      </p>
                    </div>
                    {n.isRead && (
                      <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-3 border-t border-text-muted/10 bg-base/50 text-center">
            <button className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors w-full">
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

