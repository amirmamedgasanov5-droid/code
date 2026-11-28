import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, Clock, Mail, LogOut, Lock, Calendar, FileText } from 'lucide-react';
import { User } from '../types';

interface BlockedScreenProps {
  user: User;
  onLogout: () => void;
}

export const BlockedScreen: React.FC<BlockedScreenProps> = ({ user, onLogout }) => {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!user.blockedUntil) {
      setTimeLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const difference = new Date(user.blockedUntil!).getTime() - new Date().getTime();
      if (difference <= 0) {
        setIsExpired(true);
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [user.blockedUntil]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Müəyyən edilməyib';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/95 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-red-500/30 rounded-2xl max-w-lg w-full p-6 sm:p-8 text-center text-white relative overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-300">
        {/* Glow effect */}
        
        {/* Top Badge */}
        <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-950/80 border border-red-500/40 text-red-500 mb-6">
          <Lock className="w-10 h-10 text-red-400" />
          <div className="absolute -bottom-1 -right-1 bg-red-600 text-white p-1 rounded-full">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-red-500 mb-2">
          Giriş Məhdudlaşdırılıb
        </h1>
        <p className="text-xs font-semibold text-slate-400 mb-6">
          Hesabınız inzibati qaydada müvəqqəti bloklanıb
        </p>

        {/* User Info Bar */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 mb-5 text-left flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block">Tələbə</span>
            <span className="text-sm font-semibold text-slate-100">{user.name}</span>
            {user.className && (
              <span className="ml-2 text-[11px] font-semibold bg-slate-700 text-slate-300 px-2 py-0.5 rounded-xl">
                {user.className}
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-[11px] font-semibold text-slate-400 block">İstifadəçi adı</span>
            <span className="text-xs font-semibold text-slate-300">@{user.username || user.id}</span>
          </div>
        </div>

        {/* Block Reason */}
        <div className="bg-red-950/30 border border-red-900/40 rounded-2xl p-4 mb-5 text-left">
          <div className="flex items-center gap-2 text-red-400 mb-1.5">
            <FileText className="w-4 h-4" />
            <span className="text-xs font-semibold ">Bloklanma Səbəbi</span>
          </div>
          <p className="text-sm text-slate-200 font-medium leading-relaxed">
            {user.blockReason || "Mədrəsə daxili intizam qaydalarının pozulması və administrasiyanın qərarı ilə platformaya giriş məhdudlaşdırılmışdır."}
          </p>
        </div>

        {/* Duration / Expiration Timer */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-3 pb-2 border-b border-slate-700/50">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Calendar className="w-4 h-4" />
              <span>Blokun bitmə vaxtı:</span>
            </div>
            <span className="font-semibold text-amber-400">
              {user.blockedUntil ? formatDate(user.blockedUntil) : 'Müddətsiz (Daimi)'}
            </span>
          </div>

          {user.blockedUntil && timeLeft && !isExpired ? (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-2 text-center">
                <span className="text-xl font-semibold text-white">{timeLeft.days}</span>
                <span className="block text-[11px] text-slate-400 font-semibold">Gün</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-2 text-center">
                <span className="text-xl font-semibold text-white">{timeLeft.hours}</span>
                <span className="block text-[11px] text-slate-400 font-semibold">Saat</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-2 text-center">
                <span className="text-xl font-semibold text-white">{timeLeft.minutes}</span>
                <span className="block text-[11px] text-slate-400 font-semibold">Dəqiqə</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-2 text-center">
                <span className="text-xl font-semibold text-red-400">{timeLeft.seconds}</span>
                <span className="block text-[11px] text-slate-400 font-semibold">Saniyə</span>
              </div>
            </div>
          ) : isExpired ? (
            <div className="text-xs font-semibold text-brand-400 p-2 bg-brand-950/40 border border-brand-900/40 rounded-xl">
              Blok müddəti başa çatıb. Səhifəni yeniləyərək daxil ola bilərsiniz.
            </div>
          ) : (
            <div className="text-xs font-semibold text-slate-400">
              Giriş administrasiya tərəfindən bərpa edilənədək bağlı qalacaqdır.
            </div>
          )}
        </div>

        {/* Administration Note */}
        <div className="text-[11px] text-slate-400 mb-6 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <p className="font-semibold text-slate-300 mb-1">Mədrəsə Rəhbərliyi və Baş Admin:</p>
          <div className="flex items-center justify-center gap-1.5 text-amber-300 font-semibold">
            <Mail className="w-3.5 h-3.5" />
            <a href="mailto:amirmamedgasanov5@gmail.com" className="underline hover:text-amber-200">
              amirmamedgasanov5@gmail.com
            </a>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {isExpired ? (
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3.5 px-6 rounded-xl text-xs transition-all"
            >
              Səhifəni Yenilə
            </button>
          ) : null}
          
          <button
            onClick={onLogout}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3.5 px-6 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Hesabdan Çıxış Et</span>
          </button>
        </div>
      </div>
    </div>
  );
};
