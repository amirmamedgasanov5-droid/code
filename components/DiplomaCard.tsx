import React, { useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';

export interface DiplomaData {
  id?: string;
  studentName: string;
  type: 'diploma' | 'certificate' | 'honor' | 'quran' | 'discipline';
  title?: string;
  reason: string;
  teacherName?: string;
  date?: string;
  serialNumber?: string;
  imageUrl?: string;
}

interface DiplomaCardProps {
  data: DiplomaData;
}

const TAGS: Record<DiplomaData['type'], string> = {
  diploma: 'Diplom',
  certificate: 'Sertifikat',
  honor: 'Fəxri fərman',
  quran: 'Quran təltifi',
  discipline: 'İntizam təltifi',
};

export const DiplomaCard: React.FC<DiplomaCardProps> = ({ data }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const dateStr = data.date || new Date().toLocaleDateString('az-AZ');
  const serialNo = data.serialNumber || `NM-2026-${(data.id || '0000').slice(0, 4).toUpperCase()}`;

  const download = async () => {
    if (!cardRef.current) return;
    try {
      setIsDownloading(true);
      const canvas = await html2canvas(cardRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${data.studentName.replace(/\s+/g, '_')}_${data.type}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Diploma download error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const print = () => {
    if (!cardRef.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${data.title || 'Diplom'} - ${data.studentName}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @page { size: A4 landscape; margin: 0; }
        body { margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, sans-serif;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .c { width: 95vw; max-width: 1050px; }
      </style></head><body>
      <div class="c">${cardRef.current.outerHTML}</div>
      <script>setTimeout(function(){window.print();window.close();},500);</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <div
        ref={cardRef}
        className="relative w-full aspect-[16/10.8] min-h-[340px] bg-white text-slate-900 rounded-2xl border border-slate-200 p-3 select-none"
      >
        <div className="h-full w-full rounded-xl border-2 border-indigo-700 p-6 sm:p-10 flex flex-col justify-between text-center">
          <div className="space-y-2">
            <div className="text-[11px] sm:text-xs font-semibold text-indigo-700">
              Nəsihətlər Mədrəsəsi
            </div>
            <div className="inline-block px-3 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] sm:text-xs font-medium">
              {data.title || TAGS[data.type]}
            </div>
          </div>

          <div className="space-y-3 px-2 sm:px-8">
            <span className="text-[11px] sm:text-xs text-slate-500 block">Təqdim olunur</span>
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-slate-900">{data.studentName}</h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
              {data.reason || 'Mədrəsədə göstərdiyi nizam-intizam, dərs fəallığı və yüksək nəticələrə görə təltif edilir.'}
            </p>
          </div>

          <div className="flex items-end justify-between text-left text-[11px] sm:text-[11px] text-slate-500 pt-3 border-t border-slate-200">
            <div className="space-y-0.5">
              <div>Tarix: <span className="font-medium text-slate-800">{dateStr}</span></div>
              <div className="tabular-nums">№ {serialNo}</div>
            </div>
            <div className="text-right space-y-0.5">
              <div>Müəllim / rəhbərlik</div>
              <div className="font-medium text-slate-800">{data.teacherName || 'Mədrəsə heyəti'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
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
