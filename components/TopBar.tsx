import React from 'react';
import { User } from '../types';
import { formatTodayAz } from '../src/utils/date';
import { NotificationBell } from './NotificationBell';
import { isAdminUser } from '../src/utils/roles';

export const TopBar: React.FC<{ user: User }> = ({ user }) => {
  const roleLabel = isAdminUser(user) ? (user.role === 'student' ? 'Ученик · администратор' : 'Администратор') : user.role === 'teacher' ? 'Учитель' : user.role === 'admin' ? 'Администратор' : user.role === 'parent' ? 'Родитель' : 'Ученик';
  const initial = user.name ? user.name.trim().charAt(0).toUpperCase() : 'U';
  const today = formatTodayAz();

  return (
    <header className="hidden lg:flex items-center justify-between h-14 mb-6 -mx-10 px-10 border-b border-border bg-background/95 sticky top-0 z-30">
      <div className="text-xs text-muted">{today}</div>
      <div className="flex items-center gap-4">
        <NotificationBell user={user} />
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-[13px] font-medium text-text">{user.name}</div>
            <div className="text-[11px] text-muted">{roleLabel}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-xs font-semibold overflow-hidden">
            {user.photoURL || user.avatar ? (
              <img src={user.photoURL || user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              initial
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
