import { useEffect, useState } from 'react';

export type ThemeId = 'classic' | 'minimal' | 'dark';
export type ThemeLayout = 'side' | 'top';

export const THEMES: { id: ThemeId; name: string; desc: string; layout: ThemeLayout }[] = [
  { id: 'classic', name: 'Klassik', desc: 'Hazırkı dizayn: yan menyu, yaşıl rəng, yüngül kartlar.', layout: 'side' },
  { id: 'minimal', name: 'Minimal', desc: 'Menyu yuxarıda, ağ vərəq, çoxlu boş yer, sakit boz düymələr.', layout: 'top' },
  { id: 'dark', name: 'Tünd', desc: 'Qaranlıq «komanda mərkəzi»: yığcam, yassı yan panel, yaşıl vurğu.', layout: 'side' },
];

const PREVIEW_KEY = 'ui_theme_preview';
const APPLIED_KEY = 'ui_theme_applied';

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some(t => t.id === v);
export const layoutOf = (id: ThemeId): ThemeLayout => THEMES.find(t => t.id === id)?.layout ?? 'side';

let active: ThemeId = 'classic';
export const getActiveTheme = (): ThemeId => active;

/** The administrator's own try-out theme (stored only in this browser). */
export const getPreviewTheme = (): ThemeId | null => {
  try {
    const v = localStorage.getItem(PREVIEW_KEY);
    return isThemeId(v) ? v : null;
  } catch {
    return null;
  }
};

export const setPreviewTheme = (id: ThemeId | null) => {
  try {
    if (id) localStorage.setItem(PREVIEW_KEY, id);
    else localStorage.removeItem(PREVIEW_KEY);
  } catch {}
  window.dispatchEvent(new Event('ui-theme-changed'));
};

export const applyTheme = (id: ThemeId) => {
  active = id;
  document.documentElement.setAttribute('data-theme', id);
  try {
    localStorage.setItem(APPLIED_KEY, id);
  } catch {}
  window.dispatchEvent(new Event('ui-theme-applied'));
};

/** Used before login so the sign-in screen already matches the last used theme. */
export const applyStoredTheme = () => {
  try {
    const v = localStorage.getItem(APPLIED_KEY);
    if (isThemeId(v)) {
      active = v;
      document.documentElement.setAttribute('data-theme', v);
    }
  } catch {}
};

/** React hook: the theme that is currently applied. */
export const useActiveTheme = (): ThemeId => {
  const [theme, setTheme] = useState<ThemeId>(active);
  useEffect(() => {
    const sync = () => setTheme(active);
    window.addEventListener('ui-theme-applied', sync);
    sync();
    return () => window.removeEventListener('ui-theme-applied', sync);
  }, []);
  return theme;
};
