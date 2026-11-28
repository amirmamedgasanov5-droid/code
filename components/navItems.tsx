import React from 'react';
import {
  Calendar, BookOpen, User, ClipboardList, MessageCircle,
  Library, Settings, Sparkles, LayoutGrid,
  Award, Headphones, ShieldAlert,
  Trophy, ShieldCheck, Home, Megaphone, BarChart3
} from 'lucide-react';
import { User as UserType } from '../types';
import { translations } from '../i18n';
import { isAdminUser, isStaffUser, isParentUser } from '../src/utils/roles';

export interface NavItem { to: string; icon: React.ComponentType<{ className?: string }>; label: string }
export interface NavSection { title: string; items: NavItem[] }

/** One definition of the menu, shared by the side bar and the top navigation. */
export const buildNavSections = (user: UserType | null, t: (typeof translations)['az']): NavSection[] => {
  const studentSections = [
    {
      title: "Əsas",
      items: [
        { to: "/", icon: Home, label: t.home || "İcmal" },
        { to: "/schedule", icon: Calendar, label: t.schedule || "Cədvəl" },
        { to: "/journal", icon: ClipboardList, label: t.journal || "Jurnal" },
        { to: "/homework", icon: BookOpen, label: t.homework || "Tapşırıqlar" },
      ]
    },
    {
      title: "Tədris & Elm",
      items: [
        { to: "/library", icon: Library, label: t.library || "Kitabxana" },
        { to: "/quran", icon: Headphones, label: t.quran || "Qurani-Kərim" },
        { to: "/knowledge-base", icon: BookOpen, label: t.knowledge_base || "Elmi Baza" },
        { to: "/extra", icon: Sparkles, label: t.extra || "Əlavə Dərslər" },
      ]
    },
    {
      title: "Akademik Şura",
      items: [
        { to: "/leagues", icon: Trophy, label: t.leagues || "Rütbələr & Liqa" },
        { to: "/awards", icon: Award, label: t.awards || "Mükafatlar" },
        ...(isStaffUser(user) ? [{ to: "/parent-portal", icon: ShieldCheck, label: t.parent_portal || "Valideyn Portalı" }] : []),
        { to: "/surveys", icon: ClipboardList, label: "Sorğular" },
        { to: "/complaints", icon: ShieldAlert, label: t.complaints || "İntizam" },
      ]
    },
    {
      title: "Digər",
      items: [
        { to: "/messages", icon: MessageCircle, label: t.messages || "Mesajlar" },
        { to: "/services", icon: LayoutGrid, label: "Xidmətlər" },
        { to: "/settings", icon: Settings, label: t.settings || "Tənzimləmələr" },
        { to: "/profile", icon: User, label: t.profile || "Profil & Vəsiqə" },
      ]
    }
  ];

  const navSections = isParentUser(user)
    ? [
        {
          title: 'Valideyn',
          items: [
            { to: '/parent-portal', icon: ShieldCheck, label: 'Övladımın kabineti' },
            { to: '/settings', icon: Settings, label: t.settings || 'Tənzimləmələr' },
          ],
        },
      ]
    : studentSections;

  if (isStaffUser(user)) {
    navSections.push({
      title: 'İdarəetmə',
      items: [
        { to: '/banners', icon: Megaphone, label: 'Bannerlər' },
        ...(isAdminUser(user) ? [{ to: '/admin', icon: ShieldCheck, label: 'İdarə paneli' }, { to: '/analytics', icon: BarChart3, label: 'Analitika' }] : []),
      ],
    });
  }

  return navSections;
};
