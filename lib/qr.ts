import 'server-only';
import QRCode from 'qrcode';

/** Путь SVG для QR-кода; считается при сборке, на клиент уходит только строка. */
export function qrPath(value: string) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const q = 3;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.data[y * n + x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  return { size: n + q * 2, d };
}
