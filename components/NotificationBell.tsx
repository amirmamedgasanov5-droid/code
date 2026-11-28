import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { collection, onSnapshot, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Notification, User } from '../types';

const timeAgo = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'indi';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq əvvəl`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat əvvəl`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} gün əvvəl`;
  return new Date(iso).toLocaleDateString('az-AZ');
};

const ICONS = {
  info: <Info className="w-4 h-4 text-brand-600" />,
  success: <CheckCircle2 className="w-4 h-4 text-green-600" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-600" />,
};

export const NotificationBell: React.FC<{ user: User }> = ({ user }) => {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user.uid) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setItems(list.slice(0, 30));
      },
      err => console.error('notifications listener:', err)
    );
  }, [user.uid]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const unread = useMemo(() => items.filter(n => !n.read).length, [items]);

  const markRead = async (n: Notification) => {
    if (n.read) return;
    setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await updateDoc(doc(db, 'notifications', n.id), { read: true });
    } catch (e) {
      console.error('mark read failed:', e);
    }
  };

  const markAll = async () => {
    const pending = items.filter(n => !n.read);
    setItems(prev => prev.map(x => ({ ...x, read: true })));
    await Promise.all(pending.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {})));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-10 h-10 rounded-xl border border-border bg-surface flex items-center justify-center text-text hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        aria-label="Bildirişlər"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-[min(92vw,22rem)] bg-surface border border-border rounded-2xl shadow-md z-[300] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text">Bildirişlər</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                <Check className="w-3 h-3" /> Hamısını oxundu et
              </button>
            )}
          </div>
          <div className="max-h-[22rem] overflow-y-auto custom-scrollbar">
            {items.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted">Hələ bildiriş yoxdur</div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 border-b border-border last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors ${
                    n.read ? '' : 'bg-brand-50/60 dark:bg-brand-950/20'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{ICONS[n.type] || ICONS.info}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text truncate">{n.title}</span>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
                    </span>
                    <span className="block text-xs text-muted leading-snug mt-0.5">{n.message}</span>
                    <span className="block text-[11px] text-muted/80 mt-1">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
