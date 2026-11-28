import React from 'react';
import { motion } from 'motion/react';
import { Logo } from './Logo';

export const SplashScreen: React.FC = () => (
  <motion.div
    initial={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
    className="fixed inset-0 z-[1000] bg-background flex flex-col items-center justify-center p-6 text-text"
  >
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center gap-4"
    >
      <Logo className="w-16 h-16" />
      <div className="text-center space-y-1">
        <h2 className="text-base font-semibold tracking-tight">İsnad Mədrəsəsi</h2>
        <p className="text-xs text-muted">Onlayn mədrəsə</p>
      </div>
      <div className="w-24 h-px bg-border overflow-hidden relative mt-1">
        <motion.div
          className="absolute inset-y-0 w-1/2 bg-brand-600"
          initial={{ x: '-100%' }}
          animate={{ x: '300%' }}
          transition={{ duration: 1.2, ease: [0.65, 0, 0.35, 1], repeat: Infinity }}
        />
      </div>
    </motion.div>
  </motion.div>
);
