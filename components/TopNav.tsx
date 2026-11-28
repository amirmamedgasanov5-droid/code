import { Logo } from './Logo';
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, ChevronDown } from 'lucide-react';
import { User } from '../types';
import { translations } from '../i18n';
import { buildNavSections } from './navItems';
import { NotificationBell } from './NotificationBell';

interface Props {
  user: User;
  onLogout: () => void;
}

/** Horizontal navigation used by the "minimal" theme (desktop). */
export const TopNav: React.FC<Props> = ({ user, onLogout }) => {
  const t = translations[(user.language || 'az') as keyof typeof translations];
  const sections = buildNavSections(user, t);
  const flat = sections.flatMap(s => s.items);
  const main = flat.slice(0, 4);
  const more = flat.slice(4);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const link = ({ isActive }: { isActive: boolean }) =>
    `topnav-link text-[15px] ${isActive ? 'topnav-link-active' : ''}`;

  return (
    <header className="topnav hidden lg:block fixed top-0 inset-x-0 z-[100]">
      <div className="max-w-[1080px] mx-auto px-8 h-[84px] flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-3">
          <Logo className="w-9 h-9" />
          <span className="text-[17px] tracking-tight text-text">İsnad</span>
        </NavLink>

        <nav className="flex items-center gap-7">
          {main.map(i => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} className={link}>
              {i.label}
            </NavLink>
          ))}
          {more.length > 0 && (
            <div ref={ref} className="relative">
              <button onClick={() => setOpen(o => !o)} className="topnav-link text-[15px] inline-flex items-center gap-1">
                Daha çox <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="topnav-menu absolute right-0 top-9 w-64 max-h-[70vh] overflow-y-auto p-2">
                  {more.map(i => (
                    <NavLink
                      key={i.to}
                      to={i.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${isActive ? 'bg-neutral-100 text-text' : 'text-muted hover:text-text hover:bg-neutral-50'}`
                      }
                    >
                      <i.icon className="w-4 h-4" />
                      <span>{i.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <NotificationBell user={user} />
          <span className="text-sm text-muted max-w-[140px] truncate">{user.name?.split(' ')[0]}</span>
          <button onClick={onLogout} className="text-muted hover:text-text transition-colors" title="Çıxış" aria-label="Çıxış">
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
};
