/** Иконки таб-бара в манере SF Symbols: в обычном виде — контур, у выбранной вкладки — заливка. */
type P = { filled: boolean; size?: number };

const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 28 28', fill: 'none', 'aria-hidden': true as const });
const stroke = { stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function HouseIcon({ filled, size = 28 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M4.2 13.1 13.3 5.4a1.1 1.1 0 0 1 1.4 0l9.1 7.7c.3.3.5.7.5 1.1v9a1.6 1.6 0 0 1-1.6 1.6h-4.6a.9.9 0 0 1-.9-.9v-5.2a1.1 1.1 0 0 0-1.1-1.1h-3.4a1.1 1.1 0 0 0-1.1 1.1v5.2a.9.9 0 0 1-.9.9H5.3a1.6 1.6 0 0 1-1.6-1.6v-9c0-.4.2-.8.5-1.1Z" {...stroke} fill={filled ? 'currentColor' : 'none'} />
      <path d="M2.6 13.4 14 3.9l11.4 9.5" {...stroke} />
    </svg>
  );
}

export function BooksIcon({ filled, size = 28 }: P) {
  const f = filled ? 'currentColor' : 'none';
  return (
    <svg {...base(size)}>
      <rect x="4" y="5" width="5" height="18" rx="1.4" {...stroke} fill={f} />
      <rect x="11" y="5" width="5" height="18" rx="1.4" {...stroke} fill={f} />
      <path d="m18.2 6.6 3.7-1a1.3 1.3 0 0 1 1.6.9l3 14.6a1.3 1.3 0 0 1-1 1.5l-3.6.9a1.3 1.3 0 0 1-1.6-1l-2.9-14.3a1.3 1.3 0 0 1 .8-1.6Z" transform="translate(-3 -1.5) rotate(3 21 14)" {...stroke} fill={f} />
    </svg>
  );
}

export function NewsIcon({ filled, size = 28 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M8 5h14.2A1.8 1.8 0 0 1 24 6.8V21a2 2 0 0 1-2 2H6.8A2.8 2.8 0 0 1 4 20.2V9.2A1.2 1.2 0 0 1 5.2 8H8Z" {...stroke} fill={filled ? 'currentColor' : 'none'} />
      <path d="M8 5v15.6a2.4 2.4 0 0 1-2.4 2.4" {...stroke} strokeWidth={filled ? 1.9 : 1.9} stroke={filled ? 'var(--bar-fill-gap, #fff)' : 'currentColor'} />
      <path d="M12 10.5h8M12 14.2h8M12 17.9h5" strokeWidth="1.9" strokeLinecap="round" stroke={filled ? 'var(--bar-fill-gap, #fff)' : 'currentColor'} />
    </svg>
  );
}

export function BookmarkIcon({ filled, size = 28 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M8.6 4.5h10.8a1.9 1.9 0 0 1 1.9 1.9v17a.6.6 0 0 1-.97.47L14 19.2l-6.33 4.67a.6.6 0 0 1-.97-.47v-17a1.9 1.9 0 0 1 1.9-1.9Z" transform="translate(0 .2)" {...stroke} fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}

export function CalendarIcon({ filled, size = 28 }: P) {
  const gap = filled ? 'var(--bar-fill-gap, #fff)' : 'currentColor';
  return (
    <svg {...base(size)}>
      <rect x="4" y="5.5" width="20" height="18" rx="4.2" {...stroke} fill={filled ? 'currentColor' : 'none'} />
      <path d="M4.4 11.2h19.2" strokeWidth="1.9" strokeLinecap="round" stroke={gap} />
      <path d="M9.5 3.6v3.6M18.5 3.6v3.6" {...stroke} />
      {!filled && <path d="M9.4 15.6h.01M14 15.6h.01M18.6 15.6h.01M9.4 19.2h.01M14 19.2h.01" {...stroke} strokeWidth="2.2" />}
      {filled && <path d="M9.4 15.6h.01M14 15.6h.01M18.6 15.6h.01M9.4 19.2h.01M14 19.2h.01" strokeWidth="2.2" strokeLinecap="round" stroke={gap} />}
    </svg>
  );
}
