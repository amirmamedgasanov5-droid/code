import { ArrowUpRight, ArrowDown } from 'lucide-react';

type Props = {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  variant?: 'primary' | 'light' | 'ghost';
  icon?: 'out' | 'down';
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

const base =
  'group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full text-[0.95rem] font-medium tracking-[0.01em] transition-[transform,box-shadow] duration-500 ease-expo active:scale-[0.97]';

/** Основная кнопка: заливка поднимается снизу, подпись «перекатывается». */
export function Button({ href, children, external, variant = 'primary', icon = 'out', className = '', onClick }: Props) {
  const Icon = icon === 'down' ? ArrowDown : ArrowUpRight;
  const ext = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  if (variant === 'ghost') {
    return (
      <a href={href} onClick={onClick} {...ext} className={`group inline-flex items-center gap-2.5 py-3 text-[0.95rem] font-medium ${className}`}>
        <span className="u-link pb-0.5">{children}</span>
        <Icon
          size={16}
          strokeWidth={1.6}
          className={`transition-transform duration-500 ease-expo ${icon === 'down' ? 'group-hover:translate-y-1' : 'group-hover:-translate-y-0.5 group-hover:translate-x-0.5'}`}
        />
      </a>
    );
  }
  const palette =
    variant === 'primary'
      ? 'bg-forest text-ivory hover:shadow-[0_14px_30px_-14px_rgba(17,34,25,0.55)]'
      : 'bg-ivory text-forest-deep hover:shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)]';
  const fill = variant === 'primary' ? 'bg-forest-deep' : 'bg-gold-soft';
  return (
    <a href={href} onClick={onClick} {...ext} className={`${base} ${palette} px-7 py-4 ${className}`}>
      <span aria-hidden className={`absolute inset-0 translate-y-[101%] rounded-[inherit] ${fill} transition-transform duration-500 ease-expo group-hover:translate-y-0`} />
      <span className="relative block h-[1.3em] overflow-hidden leading-[1.3]">
        <span className="block transition-transform duration-500 ease-expo group-hover:-translate-y-full">{children}</span>
        <span aria-hidden className="absolute left-0 top-full block whitespace-nowrap transition-transform duration-500 ease-expo group-hover:-translate-y-full">
          {children}
        </span>
      </span>
      <Icon size={17} strokeWidth={1.7} className="relative transition-transform duration-500 ease-expo group-hover:rotate-45" />
    </a>
  );
}
