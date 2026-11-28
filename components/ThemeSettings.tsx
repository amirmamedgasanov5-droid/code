import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Check, Eye, Globe, Loader2, RotateCcw } from 'lucide-react';
import { db } from '../firebase';
import { THEMES, ThemeId, getPreviewTheme, isThemeId, setPreviewTheme } from '../src/utils/theme';

// Static miniatures of each layout: they do not depend on the theme that is active right now.
const Mini: React.FC<{ id: ThemeId }> = ({ id }) => {
  if (id === 'minimal') {
    return (
      <div className="rounded-xl p-2.5 h-28" style={{ background: '#f3f4f6' }}>
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="w-3 h-3 rounded-full" style={{ background: '#27272a' }} />
          <span className="flex gap-1.5">
            <span className="h-1 w-6 rounded" style={{ background: '#a1a1aa' }} />
            <span className="h-1 w-6 rounded" style={{ background: '#d4d4d8' }} />
            <span className="h-1 w-6 rounded" style={{ background: '#d4d4d8' }} />
          </span>
        </div>
        <div className="p-3 h-[60px]" style={{ background: '#fff', borderRadius: 18 }}>
          <div className="h-1.5 w-20 rounded mb-1.5" style={{ background: '#52525b' }} />
          <div className="h-1.5 w-28 rounded mb-2" style={{ background: '#e4e4e7' }} />
          <div className="h-4 w-14 rounded-full" style={{ background: '#3f3f46' }} />
        </div>
      </div>
    );
  }
  if (id === 'dark') {
    return (
      <div className="rounded-xl h-28 flex overflow-hidden" style={{ background: '#0b0b0d' }}>
        <div className="w-10 p-2 space-y-1.5" style={{ background: '#141417', borderRight: '1px solid #26262c' }}>
          <div className="h-2 w-full rounded" style={{ background: '#2f5224' }} />
          <div className="h-2 w-full rounded" style={{ background: '#26262c' }} />
          <div className="h-2 w-full rounded" style={{ background: '#26262c' }} />
        </div>
        <div className="flex-1 p-2.5">
          <div className="p-2 mb-1.5" style={{ background: '#141417', border: '1px solid #26262c', borderRadius: 8 }}>
            <div className="h-1.5 w-16 rounded mb-1" style={{ background: '#8c8c97' }} />
            <div className="h-1.5 w-24 rounded" style={{ background: '#26262c' }} />
          </div>
          <div className="h-4 w-14 rounded-lg" style={{ background: '#2f5224' }} />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl h-28 flex gap-2 p-2.5" style={{ background: '#f5f5f2' }}>
      <div className="w-8 rounded-lg p-1.5 space-y-1.5" style={{ background: '#fff', border: '1px solid #e4e5df' }}>
        <div className="h-2 w-full rounded" style={{ background: '#2f5224' }} />
        <div className="h-2 w-full rounded" style={{ background: '#e4ebd8' }} />
        <div className="h-2 w-full rounded" style={{ background: '#e4ebd8' }} />
      </div>
      <div className="flex-1 p-2" style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e5df' }}>
        <div className="h-1.5 w-14 rounded mb-1.5" style={{ background: '#d4d4d8' }} />
        <div className="h-1.5 w-20 rounded mb-2" style={{ background: '#ececee' }} />
        <div className="h-4 w-14 rounded-lg" style={{ background: '#2f5224' }} />
      </div>
    </div>
  );
};

const nameOf = (id: ThemeId | null) => THEMES.find(t => t.id === id)?.name || 'Klassik';

export const ThemeSettings: React.FC = () => {
  const [preview, setPreview] = useState<ThemeId | null>(getPreviewTheme());
  const [published, setPublished] = useState<ThemeId>('classic');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'school_settings', 'main'),
        snap => {
          const t = snap.exists() ? snap.data().theme : null;
          setPublished(isThemeId(t) ? t : 'classic');
        },
        () => {}
      ),
    []
  );

  const choose = (id: ThemeId) => {
    // Choosing the already published theme simply clears the personal preview.
    const next = id === published ? null : id;
    setPreviewTheme(next);
    setPreview(next);
    setMessage('');
  };

  const reset = () => {
    setPreviewTheme(null);
    setPreview(null);
    setMessage('');
  };

  const publish = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'school_settings', 'main'), { theme: preview }, { merge: true });
      setPreviewTheme(null);
      setPreview(null);
      setMessage(`Применено для всех: ${nameOf(preview)}`);
    } catch (err: any) {
      setMessage('Saxlanmadı: ' + (err?.message || 'xəta') + '. Firestore qaydalarını dərc etdiyinizi yoxlayın.');
    } finally {
      setSaving(false);
    }
  };

  const active = preview || published;

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-text">Dizayn mövzusu</h2>
          <p className="text-xs text-muted mt-0.5">Yalnız idarəçi görür. Əvvəl özünüzdə sınayın, bəyənəndə hamıya tətbiq edin.</p>
        </div>
        <div className="text-xs text-muted text-right">
          <div>Hamı üçün aktiv: <span className="text-text font-medium">{nameOf(published)}</span></div>
          {preview && <div className="text-brand-600 dark:text-brand-400">Sizdə sınaq: {nameOf(preview)}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {THEMES.map(t => {
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => choose(t.id)}
              className={`text-left rounded-2xl border p-3 transition-colors ${
                selected ? 'border-brand-600 ring-2 ring-brand-600/15' : 'border-border hover:border-brand-300'
              }`}
            >
              <div className="mb-3"><Mini id={t.id} /></div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text">{t.name}</span>
                <span className="flex items-center gap-1 text-[11px]">
                  {published === t.id && <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-muted flex items-center gap-1"><Globe className="w-3 h-3" /> hamıda</span>}
                  {selected && <Check className="w-4 h-4 text-brand-600" />}
                </span>
              </div>
              <p className="text-xs text-muted mt-1 leading-snug">{t.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={publish} disabled={!preview || saving} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
          <span>Hamıya tətbiq et</span>
        </button>
        <button onClick={reset} disabled={!preview} className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed">
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Sınağı sıfırla</span>
        </button>
        {preview && (
          <span className="text-xs text-muted flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Hazırda yalnız siz «{nameOf(preview)}» mövzusunu görürsünüz.</span>
        )}
        {message && <span className="text-xs text-green-600">{message}</span>}
      </div>
    </section>
  );
};
