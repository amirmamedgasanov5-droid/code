import React, { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { getUiLang, onUiLangChange, setUiLang } from '../src/utils/uiLang';

export const LangSwitch: React.FC<{ className?: string }> = ({ className = '' }) => {
  return null;
  // eslint-disable-next-line no-unreachable
  const [lang, setLang] = useState(getUiLang());
  useEffect(() => onUiLangChange(() => setLang(getUiLang())), []);
  return (
    <button
      type="button"
      onClick={() => setUiLang(lang === 'ru' ? null : 'ru')}
      data-no-translate
      className={`flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border bg-surface text-text text-[11px] font-semibold hover:bg-neutral-50 transition-colors ${className}`}
      aria-label="Language"
    >
      <Globe className="w-3.5 h-3.5" />
      {lang === 'ru' ? 'Русский · AZ' : 'Azərbaycan · RU'}
    </button>
  );
};
