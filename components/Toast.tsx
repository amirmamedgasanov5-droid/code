import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type: ToastType;
  isVisible: boolean;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-8 right-8 z-[200] animate-slide-up">
      <div className={`flex items-center space-x-4 p-4 pr-12 rounded-2xl shadow-md border ${
        type === 'success' 
          ? 'bg-zinc-900 border-zinc-800 text-white' 
          : 'bg-red-50 border-red-100 text-red-800'
      }`}>
        <div className={`p-2 rounded-xl ${type === 'success' ? 'bg-white/10' : 'bg-red-100'}`}>
          {type === 'success' ? (
            <CheckCircle2 className="w-6 h-6 text-green-400" />
          ) : (
            <XCircle className="w-6 h-6 text-red-500" />
          )}
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">
            {type === 'success' ? 'Uğurlu əməliyyat' : 'Xəta baş verdi'}
          </p>
          <p className="text-xs opacity-80 mt-1">{message}</p>
        </div>
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 opacity-50 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};
