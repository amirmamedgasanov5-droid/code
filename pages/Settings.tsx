
import React, { useState } from 'react';
import { User, Language, Theme } from '../types';
import { auth, db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Globe, Moon, Sun, Monitor, Loader2, Palette, Bookmark } from 'lucide-react';
import { translations } from '../i18n';
import { setUiLang } from '../src/utils/uiLang';
import { ThemeSettings } from '../components/ThemeSettings';
import { isAdminUser } from '../src/utils/roles';

interface SettingsProps {
  user: User;
}

export const Settings: React.FC<SettingsProps> = ({ user }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const t = translations[user.language || 'az'];

  const updatePreference = async (updates: Partial<User>) => {
    setIsUpdating(true);
    try {
        if (auth.currentUser) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), updates);
            if (user.soundEffects) {
                import('../src/utils/sounds').then(m => m.playSound('click'));
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        setIsUpdating(false);
    }
  };

  const languages: { id: Language; name: string; native: string }[] = [
    { id: 'az', name: 'Azerbaijani', native: 'Azərbaycan' },
    { id: 'en', name: 'English', native: 'English' },
    { id: 'ru', name: 'Russian', native: 'Русский' },
    { id: 'tr', name: 'Turkish', native: 'Türkçe' },
    { id: 'ar', name: 'Arabic', native: 'العربية' },
  ];


  const effectsList = [
    { id: 'effectsEnabled', label: 'Premium Effektlər', desc: 'Animasiyalar və vizual təkmilləşdirmələr' },
    { id: 'animationsEnabled', label: 'Animasiyalar', desc: 'Səhifə keçidləri' },
    { id: 'highContrast', label: 'Yüksək Kontrast', desc: 'Daha aydın mətnlər' },
    { id: 'compactMode', label: 'Kompakt Rejim', desc: 'Daha sıx interfeys' },
    { id: 'showNotifications', label: 'Bildirişlər', desc: 'Sistem bildirişləri' },
    { id: 'soundEffects', label: 'Səs Effektləri', desc: 'İnteraktiv səslər' },
  ];

  const requestPushPermission = async () => {
    if (!('Notification' in window)) {
      alert("Bu brauzer bildirişləri dəstəkləmir.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      updatePreference({ showNotifications: true });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-text">{t.settings}</h1>
        <p className="text-xs text-muted mt-0.5">Fərdiləşdirmə və idarəetmə</p>
      </header>

      <div className="grid gap-8">
        {isAdminUser(user) && <ThemeSettings />}

        <section className="space-y-5">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-background rounded-xl flex items-center justify-center border border-border shadow-sm">
                    <Bookmark className="w-5 h-5 text-text" />
                </div>
                <h2 className="text-xl font-semibold text-text tracking-tight">Vizual Effektlər</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {effectsList.map(effect => (
                    <button
                        key={effect.id}
                        onClick={() => {
                            if (effect.id === 'showNotifications' && !user.showNotifications) {
                                requestPushPermission();
                            } else {
                                updatePreference({ [effect.id]: !((user as any)[effect.id]) });
                            }
                        }}
                        disabled={isUpdating}
                        className={`flex items-center justify-between p-6 rounded-2xl border transition-all ${
                            (user as any)[effect.id] 
                            ? 'bg-brand text-white border-brand' 
                            : 'bg-surface border-border text-muted hover:border-brand/20'
                        }`}
                    >
                        <div className="text-left">
                            <p className="text-[11px] font-semibold ">{effect.label}</p>
                            <p className="text-[11px] font-semibold opacity-60 mt-1">{effect.desc}</p>
                        </div>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${(user as any)[effect.id] ? 'bg-white/30' : 'bg-slate-200'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${(user as any)[effect.id] ? 'left-4.5' : 'left-0.5'}`} />
                        </div>
                    </button>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-background rounded-xl flex items-center justify-center border border-border shadow-sm">
                    <Globe className="w-5 h-5 text-text" />
                </div>
                <h2 className="text-xl font-semibold text-text tracking-tight">{t.language}</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {languages.filter(l => l.id === 'ru').map((lang) => (
                    <button
                        key={lang.id}
                        onClick={() => { setUiLang(lang.id === 'ru' ? 'ru' : null); updatePreference({ language: lang.id }); }}
                        disabled={isUpdating}
                        className={`flex flex-col items-center justify-center p-6 rounded-2xl border transition-all group ${
                            user.language === lang.id 
                            ? 'bg-brand text-white border-brand' 
                            : 'bg-surface border-border text-muted hover:border-brand/20'
                        }`}
                    >
                        <span className="text-[11px] font-semibold mb-1">{lang.id}</span>
                        <span className="text-[11px] font-semibold opacity-60 group-hover:opacity-100 ">{lang.native}</span>
                    </button>
                ))}
            </div>
        </section>

      </div>
      
      {isUpdating && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-brand text-white px-8 py-4 rounded-2xl flex items-center gap-3 shadow-md z-[1000] animate-reveal border border-white/20">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-[11px] font-semibold ">Yadda saxlanılır...</span>
          </div>
      )}
    </div>
  );
};
