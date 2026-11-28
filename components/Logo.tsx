import React from 'react';

/** İsnad mark (transparent PNG, /public/logo.png). */
export const Logo: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <img src="/logo.png" alt="İsnad" className={`object-contain select-none shrink-0 ${className}`} draggable={false} />
);

export const BRAND = {
  name: 'İsnad',
  full: 'İsnad Onlayn Mədrəsə',
};
