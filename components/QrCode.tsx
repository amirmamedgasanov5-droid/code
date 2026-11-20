import QRCode from 'qrcode';

/** QR-код, собранный на сервере в SVG: без картинок и внешних сервисов. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const q = 3;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n + q * 2} ${n + q * 2}`} role="img" aria-label={label} className="h-full w-full" shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#f5f0e6" />
      <path d={d} fill="#112219" />
    </svg>
  );
}
