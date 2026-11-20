'use client';

import { Bookmark, Copy, Share } from 'lucide-react';
import { shareText } from '../ui';
import { useApp } from '../AppProvider';

export function IconBtn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={active} className={`grid size-9 place-items-center rounded-full transition-colors active:bg-fill ${active ? 'text-tint' : 'text-label2'}`}>
      {children}
    </button>
  );
}

/** Три стандартных действия: закладка, копировать, поделиться */
export function Actions({ markId, mark, text }: { markId: string; mark: Parameters<ReturnType<typeof useApp>['toggleMark']>[0]; text: string }) {
  const { isMarked, toggleMark, toast } = useApp();
  const on = isMarked(markId);
  return (
    <div className="flex items-center">
      <IconBtn label={on ? 'Убрать из закладок' : 'В закладки'} active={on} onClick={() => toggleMark(mark)}>
        <Bookmark size={19} strokeWidth={2} fill={on ? 'currentColor' : 'none'} />
      </IconBtn>
      <IconBtn
        label="Копировать"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast('Скопировано');
          } catch {
            toast('Не удалось скопировать');
          }
        }}
      >
        <Copy size={18} strokeWidth={2} />
      </IconBtn>
      <IconBtn label="Поделиться" onClick={() => shareText(text, toast)}>
        <Share size={18} strokeWidth={2} />
      </IconBtn>
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id: string }) {
  return (
    <label className="flex h-[38px] items-center gap-2 rounded-[11px] bg-fill px-2.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="shrink-0 text-label2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} type="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-label2 [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button onClick={() => onChange('')} aria-label="Очистить" className="grid size-[18px] place-items-center rounded-full bg-label2 text-bg">
          <svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="m1 1 8 8M9 1 1 9" />
          </svg>
        </button>
      )}
    </label>
  );
}
