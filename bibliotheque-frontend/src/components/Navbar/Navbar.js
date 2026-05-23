import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageThemeSwitcher from '../LanguageThemeSwitcher/LanguageThemeSwitcher';
import './Navbar.css';

const formatNotifTime = (value, t, lang) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return t('notif.justNow');
  if (diffMin < 60) return t('notif.minutesAgo', { count: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return t('notif.hoursAgo', { count: diffH });
  const locale = lang && lang.startsWith('en') ? 'en-GB' : 'fr-FR';
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ' ' + date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

const formatBadge = (n) => {
  if (!n) return '';
  if (n > 99) return '99+';
  return String(n);
};

// Derive a short "source" label key (notif.fromAdmin / fromStudent / fromTeacher)
// from a notification's type + related_entity_type. Returns null when unknown so
// the UI can skip rendering the chip.
const notifSourceKey = (notif) => {
  const rel = String(notif?.related_entity_type || '').toLowerCase();
  const type = String(notif?.type || '');
  if (type === 'SUPPORT_TICKET') {
    if (rel === 'support_ticket') return 'notif.fromStudent';
    if (rel.startsWith('support_ticket_')) return 'notif.fromAdmin';
  }
  if (type === 'BOOK_RESERVATION' || type === 'BOOK_LOAN_REQUEST') return 'notif.fromStudent';
  if (type === 'DOCUMENT_UPLOAD') return 'notif.fromTeacher';
  return null;
};

export default function Navbar({
  title,
  onSearch,
  hasNotif = false,
  // Real notification mode (admin) — when these props are provided the bell
  // renders a counter + dropdown instead of the legacy red dot.
  notifications = null,
  unreadCount = 0,
  onOpenNotifications,
  onMarkAsRead,
  onMarkAllRead,
  onNotificationClick,
}) {
  const { t, i18n } = useTranslation();
  const [time, setTime] = useState(new Date());
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const locale = (i18n.language || 'fr').startsWith('en') ? 'en-GB' : 'fr-TN';

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close the dropdown when clicking outside
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const useRealNotifications = Array.isArray(notifications);

  const handleBellClick = () => {
    if (!useRealNotifications) return;
    const next = !open;
    setOpen(next);
    if (next && typeof onOpenNotifications === 'function') {
      onOpenNotifications();
    }
  };

  const handleItemClick = (notif) => {
    if (typeof onNotificationClick === 'function') {
      onNotificationClick(notif);
    } else if (!notif.is_read && typeof onMarkAsRead === 'function') {
      onMarkAsRead(notif.id);
    }
    setOpen(false);
  };

  return (
    <header className="app-navbar">
      <div className="navbar-title">
        {title || 'Tableau de bord'}<span>.</span>
      </div>
      <div className="navbar-right">
        <span className="navbar-time">
          {time.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
          {' — '}
          {time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
        </span>
        {onSearch && (
          <div className="navbar-search">
            <span className="navbar-search-icon">🔍</span>
            <input
              type="text"
              placeholder={t('common.searchPlaceholder', 'Rechercher...')}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        )}

        {/* Switchers FR/EN + dark/light (globaux à tous les dashboards) */}
        <LanguageThemeSwitcher variant="inline" size="sm" />


        <div className="navbar-notif-wrap" ref={wrapperRef}>
          <button
            type="button"
            className="navbar-notif-btn"
            onClick={handleBellClick}
            aria-label={t('notif.title', 'Notifications')}
          >
            🔔
            {useRealNotifications
              ? unreadCount > 0 && (
                  <span className="notif-count" aria-label={`${unreadCount} non lues`}>
                    {formatBadge(unreadCount)}
                  </span>
                )
              : hasNotif && <span className="notif-dot" />}
          </button>

          {useRealNotifications && open && (
            <div className="notif-dropdown" role="menu">
              <header className="notif-dropdown-header">
                <strong>{t('notif.title', 'Notifications')}</strong>
                <button
                  type="button"
                  className="notif-mark-all"
                  onClick={() => onMarkAllRead && onMarkAllRead()}
                  disabled={unreadCount === 0}
                >
                  {t('notif.markAllRead', 'Tout marquer comme lu')}
                </button>
              </header>

              <ul className="notif-list">
                {notifications.length === 0 && (
                  <li className="notif-empty">{t('notif.empty', 'Aucune notification.')}</li>
                )}
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`notif-item${n.is_read ? '' : ' is-unread'}`}
                    onClick={() => handleItemClick(n)}
                    role="menuitem"
                  >
                    {!n.is_read && <span className="notif-unread-dot" aria-hidden="true" />}
                    <div className="notif-item-body">
                      <div className="notif-item-title">{n.title}</div>
                      <div className="notif-item-message">{n.message}</div>
                      <div className="notif-item-meta">
                        <span className="notif-item-time">{formatNotifTime(n.created_at, t, i18n.language)}</span>
                        {notifSourceKey(n) && (
                          <span className="notif-item-source">{t(notifSourceKey(n))}</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
