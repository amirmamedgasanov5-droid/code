import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { Printer, Download, RotateCw } from 'lucide-react';
import { User } from '../types';

interface StudentIDCardProps {
  user: User;
  className?: string;
}

export const StudentIDCard: React.FC<StudentIDCardProps> = ({ user, className = '' }) => {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const rawId = (user.id || user.uid || '0000').replace(/[^a-zA-Z0-9]/g, '');
  const idNum = Math.abs((user.name.length * 271 + (user.uid || '').length * 137 + 492) % 9000 + 1000);
  const serial = `2026-MED-${idNum}`;
  const verificationCode = `VER-${rawId.slice(0, 6).toUpperCase()}-${idNum}`;

  const qrData = JSON.stringify({
    institution: 'Nəsihətlər Mədrəsəsi',
    type: 'Student ID',
    serial,
    code: verificationCode,
    name: user.name,
    username: user.username || '',
    issued: '2026',
    status: 'ACTIVE_STUDENT',
  });

  const download = async () => {
    const el = isFlipped ? backRef.current : frontRef.current;
    if (!el) return;
    try {
      setIsDownloading(true);
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: null, logging: false });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${user.name.replace(/\s+/g, '_')}_vesiqe_${isFlipped ? 'arxa' : 'on'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Card download error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const print = () => {
    const w = window.open('', '_blank');
    if (!w || !frontRef.current || !backRef.current) return;
    w.document.write(`<html><head><title>Tələbə vəsiqəsi - ${user.name}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 24px;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .w { width: 86mm; height: 54mm; }
      </style></head><body>
      <div class="w">${frontRef.current.outerHTML}</div>
      <div class="w">${backRef.current.outerHTML}</div>
      <script>setTimeout(function(){window.print();window.close();},600);</script>
      </body></html>`);
    w.document.close();
  };

  const cardBase = 'w-full aspect-[1.586] rounded-2xl p-5 flex flex-col justify-between overflow-hidden';

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="w-full max-w-[460px] mx-auto">
        <div className={isFlipped ? 'hidden' : 'block'}>
          <div ref={frontRef} className={`${cardBase} bg-indigo-700 text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold tracking-wide">Nəsihətlər Mədrəsəsi</div>
                <div className="text-[11px] text-indigo-200">Tələbə vəsiqəsi</div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/15">Aktiv</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-20 h-24 rounded-2xl bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center text-3xl font-semibold shrink-0">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold leading-tight break-words">{user.name}</h3>
                {user.className && <div className="text-[11px] text-indigo-200">Sinif: {user.className}</div>}
                {user.username && <div className="text-[11px] text-indigo-200">@{user.username}</div>}
              </div>
            </div>

            <div className="flex items-end justify-between text-[11px] text-indigo-200">
              <span className="tabular-nums">{serial}</span>
              <span>2026 / 2027</span>
            </div>
          </div>
        </div>

        <div className={isFlipped ? 'block' : 'hidden'}>
          <div ref={backRef} className={`${cardBase} bg-white text-slate-900 border border-slate-200`}>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold text-slate-800">Nəsihətlər Mədrəsəsi</span>
              <span className="tabular-nums">{serial}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-xl border border-slate-200 bg-white shrink-0">
                <QRCodeSVG value={qrData} size={86} level="M" fgColor="#312e81" />
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Bu vəsiqə yalnız sahibinə məxsusdur. Tapılarsa mədrəsə rəhbərliyinə təhvil verin. Həqiqiliyi QR-kod ilə yoxlanılır.
              </p>
            </div>
            <div className="flex items-end justify-between text-[11px] text-slate-500">
              <span className="tabular-nums">{verificationCode}</span>
              <span>Rəhbərlik imzası</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => setIsFlipped(!isFlipped)} className="btn-secondary">
          <RotateCw className="w-3.5 h-3.5" />
          <span>{isFlipped ? 'Ön tərəf' : 'Arxa tərəf'}</span>
        </button>
        <button type="button" onClick={print} className="btn-secondary">
          <Printer className="w-3.5 h-3.5" />
          <span>Çap et (A4)</span>
        </button>
        <button type="button" onClick={download} disabled={isDownloading} className="btn-primary disabled:opacity-50">
          <Download className="w-3.5 h-3.5" />
          <span>{isDownloading ? 'Yüklənir...' : 'PNG yüklə'}</span>
        </button>
      </div>
    </div>
  );
};
