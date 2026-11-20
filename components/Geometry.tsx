'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ring, star } from '@/lib/geometry';
import { EXPO } from './motion';

type Layer = { d: string; w: number; o: number; gold?: boolean; spin?: 'fwd' | 'rev'; depth: number };

/**
 * Эмблема Хидаи: геометрия восьмиугольной звезды, выстроенная из тонких линий.
 * Внутри — слово «هداية». Линии прорисовываются при входе; слои очень медленно вращаются.
 */
export function Emblem({ animate = true, className = '', word = true }: { animate?: boolean; className?: string; word?: boolean }) {
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 20 });
  const sy = useSpring(py, { stiffness: 60, damping: 20 });
  const tx = useTransform(sx, (v) => v * 10);
  const ty = useTransform(sy, (v) => v * 10);

  // Всё построено на одной сетке: внутренние вершины внешней звезды лежат на восьмиугольнике r=222,
  // в него вписана золотая звезда {8/3}, её внутренний восьмиугольник (r=120) несёт слово.
  const layers: Layer[] = [
    { d: ring(16, 298, 0), w: 0.9, o: 0.35, depth: 0 },
    { d: star(8, 2, 290, 22.5), w: 0.9, o: 0.5, spin: 'fwd', depth: 1 },
    { d: star(8, 2, 290, 0), w: 1.5, o: 1, depth: 1 },
    { d: ring(8, 222, 22.5), w: 1, o: 0.8, depth: 2 },
    { d: star(8, 3, 222, 22.5), w: 1.5, o: 1, gold: true, depth: 2 },
  ];


  return (
    <div
      className={`relative ${className}`}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      <motion.svg
        viewBox="-310 -310 620 620"
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label="Геометрический орнамент: восьмиконечная звезда"
        style={{ x: tx, y: ty }}
      >
        {layers.map((l, i) => (
          <g key={i} className={l.spin === 'fwd' ? 'spin-slow' : l.spin === 'rev' ? 'spin-slow-rev' : undefined}>
            <motion.path
              d={l.d}
              fill="none"
              stroke={l.gold ? '#b39a66' : '#1e3b2e'}
              strokeWidth={l.w}
              strokeLinejoin="round"
              strokeOpacity={l.o}
              initial={animate ? { pathLength: 0, opacity: 0 } : false}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 2.4, delay: 0.15 + i * 0.18, ease: EXPO }}
            />
          </g>
        ))}
        <motion.path
          d={ring(8, 120, 0)}
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1.2 }}
          style={{ fill: '#fbf8f2' }}
        />
        <path d={ring(8, 120, 0)} fill="none" stroke="#1e3b2e" strokeWidth="1.4" />
        <path d={ring(8, 109, 0)} fill="none" stroke="#b39a66" strokeWidth="0.9" />
        {word && (
          <motion.text
            x="0"
            y="31"
            textAnchor="middle"
            fontSize="94"
            fill="#112219"
            style={{ fontFamily: 'var(--font-arabic)' }}
            direction="rtl"
            initial={animate ? { opacity: 0, y: 14 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 1.4, ease: EXPO }}
          >
            هداية
          </motion.text>
        )}
      </motion.svg>
    </div>
  );
}

/** Только линейная звезда без слова — для маленьких знаков и загрузки. */
export function StarMark({ size = 28, stroke = '#1e3b2e', accent = '#b39a66' }: { size?: number; stroke?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <g strokeWidth="2.2" strokeLinejoin="round">
        <rect x="15" y="15" width="34" height="34" stroke={stroke} />
        <rect x="15" y="15" width="34" height="34" transform="rotate(45 32 32)" stroke={accent} />
      </g>
    </svg>
  );
}
