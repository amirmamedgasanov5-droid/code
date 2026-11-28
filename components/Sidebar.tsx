import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LogOut, Menu, X, ChevronRight
} from 'lucide-react';
import { User as UserType } from '../types';
import { translations } from '../i18n';
import { LangSwitch } from './LangSwitch';
import { isAdminUser } from '../src/utils/roles';
import { NotificationBell } from './NotificationBell';
import { buildNavSections } from './navItems';

interface SidebarProps {
  user: UserType | null;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** The desktop rail is replaced by the top navigation (minimal theme). */
  hideDesktop?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, onLogout, collapsed, onToggleCollapsed, hideDesktop = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const lang = (user?.language || 'az') as keyof typeof translations;
  const t = translations[lang];

  const toggleSidebar = () => setIsOpen(!isOpen);

  const navSections = buildNavSections(user, t);

  const userInitial = user?.name ? user.name.trim().charAt(0).toUpperCase() : 'U';
  const flatItems = navSections.flatMap((sec, i) => sec.items.map((it, j) => ({ ...it, divider: j === 0 && i > 0 })));

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-surface border-b border-border flex items-center justify-between px-4 z-[100]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold">N</div>
          <span className="text-sm font-semibold tracking-tight text-text">Nəsihətlər</span>
        </div>
        <div className="flex items-center gap-2">
          {user && <NotificationBell user={user} />}
          <button
            onClick={toggleSidebar}
            className="w-9 h-9 flex items-center justify-center text-text hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            aria-label="Menyu"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Floating rail */}
      <aside
        className={`${hideDesktop ? 'lg:hidden' : ''} fixed top-4 bottom-4 left-4 ${collapsed ? 'lg:w-[72px]' : 'lg:w-60'} w-64 bg-surface border border-border rounded-2xl shadow-sm flex flex-col z-[110] transition-all duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-[120%]'
        }`}
      >
        <div className={`h-16 flex items-center ${collapsed ? 'lg:justify-center' : ''} px-4 gap-2.5 shrink-0`}>
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">N</div>
          <span className={`text-sm font-semibold tracking-tight text-text ${collapsed ? 'lg:hidden' : ''}`}>Nəsihətlər</span>
        </div>

        <button
          onClick={onToggleCollapsed}
          className="hidden lg:flex absolute -right-3 top-[52px] w-6 h-6 rounded-full bg-surface border border-border items-center justify-center text-indigo-600 shadow-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
          aria-label="Menyunu genişləndir / yığ"
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>

        <nav className="flex-1 px-2.5 py-2 space-y-0.5 overflow-y-auto no-scrollbar" onClick={() => setIsOpen(false)}>
          {flatItems.map((item) => (
            <React.Fragment key={item.to}>
              {item.divider && <div className="my-2 mx-2 border-t border-border" />}
              <NavLink
                to={item.to}
                end={item.to === '/'}
                title={item.label}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 ${collapsed ? 'lg:justify-center lg:px-0' : ''} px-3 h-10 rounded-xl text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                      : 'text-muted hover:text-text hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-indigo-600" />}
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                  </>
                )}
              </NavLink>
            </React.Fragment>
          ))}
        </nav>

        <div className="p-2.5 border-t border-border shrink-0">
          <LangSwitch className={`w-full justify-center mb-2 ${collapsed ? 'lg:hidden' : ''}`} />
          <div className={`flex items-center ${collapsed ? 'lg:flex-col lg:gap-2' : ''} justify-between gap-2 p-1.5`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden">
                {user?.photoURL || user?.avatar ? (
                  <img src={user?.photoURL || user?.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  userInitial
                )}
              </div>
              <div className={`flex flex-col min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
                <span className="text-xs font-medium text-text truncate">{user?.name ? user.name.split(' ')[0] : 'İstifadəçi'}</span>
                <span className="text-[11px] text-muted leading-none mt-0.5">
                  {isAdminUser(user) ? (user?.role === 'student' ? 'Tələbə · İdarəçi' : 'İdarəçi') : user?.role === 'teacher' ? 'Müəllim' : user?.role === 'admin' ? 'İnzibatçı' : user?.role === 'parent' ? 'Valideyn' : 'Tələbə'}
                </span>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 text-muted hover:text-red-600 transition-colors shrink-0 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
              title="Çıxış"
              aria-label="Çıxış"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/30 z-[105]" onClick={toggleSidebar} />
      )}
    </>
  );
};
