import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';
import { isAdminUser } from '../src/utils/roles';
import { ThemeId, applyTheme, getPreviewTheme, isThemeId } from '../src/utils/theme';

/**
 * Chooses the active theme:
 *  1. the administrator's own preview (only on the administrator's device), else
 *  2. the theme the administrator published for everyone (school_settings/main.theme), else
 *  3. the classic theme.
 */
export const ThemeManager: React.FC<{ user: User }> = ({ user }) => {
  const [schoolTheme, setSchoolTheme] = useState<ThemeId | null>(null);
  const [previewTick, setPreviewTick] = useState(0);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'school_settings', 'main'),
        snap => {
          const t = snap.exists() ? snap.data().theme : null;
          setSchoolTheme(isThemeId(t) ? t : null);
        },
        () => {}
      ),
    []
  );

  useEffect(() => {
    const onChange = () => setPreviewTick(v => v + 1);
    window.addEventListener('ui-theme-changed', onChange);
    return () => window.removeEventListener('ui-theme-changed', onChange);
  }, []);

  useEffect(() => {
    const preview = isAdminUser(user) ? getPreviewTheme() : null;
    applyTheme(preview || schoolTheme || 'classic');
  }, [schoolTheme, user, previewTick]);

  return null;
};
