import React from 'react';
import { User } from '../types';
import { formatTodayAz } from '../src/utils/date';
import { NotificationBell } from './NotificationBell';
import { isAdminUser } from '../src/utils/roles';

export const TopBar: React.FC<{ user: User }> = ({ user }) => {
  const roleLabel = isAdminUser(user) ? (user.role === 'student' ? 'Tələbə · İdarəçi' : 'İdarəçi') : user.role === 'teacher' ? 'Müəllim' : user.role === 'admin' ? 'İnzibatçı' : user.role === 'parent' ? 'Valideyn' : 'Tələbə';
  const initial = user.name ? user.name.trim().charAt(0).toUpperCase() : 'U';
  const today = formatTodayAz();

  return (
    <header className="hidden lg:flex items-center justify-between h-16 px-5 mb-5 bg-surface border border-border rounded-2xl">
      <div>
        <div className="text-sm font-semibold tracking-tight text-text">İsnad Onlayn Mədrəsə</div>
        <div className="text-[11px] text-muted capitalize">{today}</div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell user={user} />
        <div className="text-right leading-tight">
          <div className="text-xs font-medium text-text">{user.name}</div>
          <div className="text-[11px] text-muted">{roleLabel}</div>
        </div>
        <div className="w-9 h-9 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-semibold overflow-hidden">
          {user.photoURL || user.avatar ? (
            <img src={user.photoURL || user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            initial
          )}
        </div>
      </div>
    </header>
  );
};
