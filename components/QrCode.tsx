export type Qr = { size: number; d: string };

export function QrCode({ qr, label }: { qr: Qr; label: string }) {
  return (
    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={label} className="h-full w-full" shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={qr.d} fill="#0e1210" />
    </svg>
  );
}
