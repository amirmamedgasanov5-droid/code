import { Logo } from './Logo';
import React from 'react';
import { Download, X, Smartphone, Globe } from 'lucide-react';

interface InstallPromptProps {
  onInstall: () => void;
  onClose: () => void;
}

export const InstallPrompt: React.FC<InstallPromptProps> = ({ onInstall, onClose }) => {
  return (
    // Убрали p-6, добавили flex-col для растягивания
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white animate-fade-in">
      {/* Убрали max-w-sm, сделали ширину 100% и высоту 100%, убрали скругления для полного экрана */}
      <div className="w-full h-full flex flex-col items-center justify-center relative p-6">
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
        >
          <X className="w-8 h-8" />
        </button>

        <div className="flex flex-col items-center text-center max-w-sm">
          <Logo className="w-20 h-20 mb-8" />

          <h2 className="text-3xl font-semibold text-zinc-900 tracking-tight mb-4">
            Tətbiqi Yükləyin
          </h2>
          <p className="text-zinc-500 text-base mb-10 leading-relaxed">
            İsnad Mədrəsəsi platformasına daha sürətli giriş üçün tətbiqi ana ekranınıza əlavə edin.
          </p>

          <div className="space-y-4 w-full">
            <button 
              onClick={onInstall}
              className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-brand-700 transition-colors flex items-center justify-center"
            >
              <Smartphone className="w-5 h-5 mr-2" />
              TƏTBİQİ QURMAQ
            </button>
            <button 
              onClick={onClose}
              className="w-full bg-transparent text-zinc-400 py-4 rounded-2xl font-semibold text-xs hover:text-zinc-900 transition-all"
            >
              İNDİ YOX, BRAUZERDƏ QAL
            </button>
          </div>
          
          <div className="mt-12 flex items-center text-[11px] text-zinc-300 font-semibold ">
            <Globe className="w-3 h-3 mr-1" />
            Veb-Tətbiq Texnologiyası
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scale-up {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-up {
          animation: scale-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};