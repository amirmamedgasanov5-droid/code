import React from 'react';
import { motion } from 'motion/react';

export const SplashScreen: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[1000] bg-[#fafafa] dark:bg-[#0c0d0e] flex flex-col items-center justify-center p-6 text-neutral-900 dark:text-neutral-100"
    >
      <div className="flex flex-col items-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold tracking-tight ">
          NM
        </div>
        <div className="text-center space-y-0.5">
          <h2 className="text-sm font-semibold tracking-tight">
            Nəsihətlər Mədrəsəsi
          </h2>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 tracking-wide font-normal">
            Akademik Portal yüklənir...
          </p>
        </div>
      </div>
    </motion.div>
  );
};
