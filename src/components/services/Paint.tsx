
import React, { useRef, useEffect, useState } from 'react';
import { X, Eraser, Square, Circle, Minus, Type, Download, Trash2, Undo, Maximize2, Minimize2, MousePointer2, Image as ImageIcon } from 'lucide-react';
import { rtdb, auth } from '../../../firebase';
import { ref, onValue, set, push, onChildAdded, off, remove, serverTimestamp } from 'firebase/database';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../../../types';
import { uploadImageToImgBB } from '../../utils/imgbb';

interface PaintProps {
  user: User;
  onClose: () => void;
}

interface DrawingPath {
  points?: { x: number; y: number }[];
  color?: string;
  lineWidth?: number;
  tool: string;
  imageUrl?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface Cursor {
  x: number;
  y: number;
  name: string;
  color: string;
}

export const Paint: React.FC<PaintProps> = ({ user, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(5);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'rect' | 'circle'>('pen');
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [cursors, setCursors] = useState<{ [key: string]: Cursor }>({});
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  const userColor = useRef('#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Listen for new drawing paths
    const drawingRef = ref(rtdb, 'paint/drawing');
    onChildAdded(drawingRef, (snapshot) => {
      const data = snapshot.val() as DrawingPath;
      drawPath(data);
    });

    // Listen for cursors
    const cursorsRef = ref(rtdb, 'paint/cursors');
    onValue(cursorsRef, (snapshot) => {
      const data = snapshot.val() || {};
      // Remove self from cursors to avoid seeing own ghost cursor
      if (user?.uid) {
        const newData = { ...data };
        delete newData[user.uid];
        setCursors(newData);
      } else {
        setCursors(data);
      }
    });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      off(drawingRef);
      off(cursorsRef);
      if (user?.uid) {
        remove(ref(rtdb, `paint/cursors/${user.uid}`));
      }
    };
  }, [user?.uid]);

  const drawPath = (data: DrawingPath) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (data.tool === 'image' && data.imageUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, data.x || 0, data.y || 0, data.w || 100, data.h || 100);
      };
      img.src = data.imageUrl;
      return;
    }

    if (!data.points || data.points.length === 0) return;

    ctx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : (data.color || '#000000');
    ctx.lineWidth = data.lineWidth || 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (data.tool === 'pen' || data.tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(data.points[0].x, data.points[0].y);
      for (let i = 1; i < data.points.length; i++) {
        ctx.lineTo(data.points[i].x, data.points[i].y);
      }
      ctx.stroke();
    } else if (data.tool === 'rect') {
      const start = data.points[0];
      const end = data.points[1];
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (data.tool === 'circle') {
      const start = data.points[0];
      const end = data.points[1];
      const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
      ctx.beginPath();
      ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });
    setSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height));
    setCurrentPath([{ x, y }]);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = lineWidth;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    // Update cursor position in RTDB
    if (user) {
      set(ref(rtdb, `paint/cursors/${user.uid}`), {
        x, y,
        name: user.name || 'Anonim',
        color: userColor.current
      });
    }

    if (!isDrawing) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
      setCurrentPath(prev => [...prev, { x, y }]);
    } else {
      if (snapshot) ctx.putImageData(snapshot, 0, 0);
      ctx.beginPath();
      if (tool === 'rect') {
        ctx.strokeRect(startPos.x, startPos.y, x - startPos.x, y - startPos.y);
      } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(x - startPos.x, 2) + Math.pow(y - startPos.y, 2));
        ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('changedTouches' in e) ? e.changedTouches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('changedTouches' in e) ? e.changedTouches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    // Push path to RTDB
    const finalPath = tool === 'pen' || tool === 'eraser' 
      ? currentPath 
      : [{ x: startPos.x, y: startPos.y }, { x, y }];

    push(ref(rtdb, 'paint/drawing'), {
      points: finalPath,
      color: tool === 'eraser' ? '#ffffff' : color,
      lineWidth,
      tool,
      timestamp: serverTimestamp()
    });

    setCurrentPath([]);
  };

  const clearCanvas = () => {
    if (window.confirm('Bütün rəsmi silmək istəyirsiniz?')) {
      remove(ref(rtdb, 'paint/drawing'));
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'drawing.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imageUrl = await uploadImageToImgBB(file);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.8;
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;

        push(ref(rtdb, 'paint/drawing'), {
          tool: 'image',
          imageUrl,
          x, y, w, h,
          timestamp: serverTimestamp()
        });
      };
      img.src = imageUrl;
    } catch (error) {
      console.error('Image upload failed:', error);
      alert('Şəkil yüklənərkən xəta baş verdi.');
    }
  };

  return (
    <div className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center ${isFullScreen ? 'p-0' : 'p-4'}`}>
      <div className={`bg-white shadow-md flex flex-col overflow-hidden transition-all duration-300 ${isFullScreen ? 'w-full h-full rounded-0' : 'w-full max-w-5xl h-[85vh] rounded-2xl'}`}>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <h3 className="font-semibold text-text text-[11px]">Canlı Rəsm</h3>
            </div>
            
            <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-border">
              <button 
                onClick={() => setTool('pen')}
                className={`p-1.5 rounded-xl transition-colors ${tool === 'pen' ? 'bg-brand text-white' : 'hover:bg-slate-100 text-muted'}`}
                title="Qələm"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setTool('eraser')}
                className={`p-1.5 rounded-xl transition-colors ${tool === 'eraser' ? 'bg-brand text-white' : 'hover:bg-slate-100 text-muted'}`}
                title="Pozan"
              >
                <Eraser className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setTool('rect')}
                className={`p-1.5 rounded-xl transition-colors ${tool === 'rect' ? 'bg-brand text-white' : 'hover:bg-slate-100 text-muted'}`}
                title="Düzbucaqlı"
              >
                <Square className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setTool('circle')}
                className={`p-1.5 rounded-xl transition-colors ${tool === 'circle' ? 'bg-brand text-white' : 'hover:bg-slate-100 text-muted'}`}
                title="Çevrə"
              >
                <Circle className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <input 
                type="color" 
                value={color} 
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-none bg-transparent"
              />
              <input 
                type="range" 
                min="1" 
                max="30" 
                value={lineWidth} 
                onChange={(e) => setLineWidth(parseInt(e.target.value))}
                className="w-20 accent-brand"
              />
            </div>

            <label className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-border cursor-pointer transition-all text-muted">
              <ImageIcon className="w-4 h-4" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)} 
              className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-border text-muted transition-all"
              title={isFullScreen ? "Kiçilt" : "Tam ekran"}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={downloadImage} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-border text-muted transition-all">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={clearCanvas} className="p-2 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100 text-red-500 transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border mx-2" />
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-white relative cursor-crosshair overflow-hidden">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-full block"
          />

          {/* Cursors */}
          {Object.entries(cursors).map(([id, cursorData]) => {
            const cursor = cursorData as Cursor;
            return (
              <motion.div
                key={id}
                initial={false}
                animate={{ x: cursor.x, y: cursor.y }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute pointer-events-none z-50 flex flex-col items-start"
                style={{ left: 0, top: 0 }}
              >
                <MousePointer2 
                  className="w-5 h-5 -rotate-90 drop-shadow-md" 
                  style={{ 
                    color: 'white', 
                    fill: cursor.color,
                    stroke: cursor.color,
                    strokeWidth: 2
                  }} 
                />
                <span 
                  className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-md border border-white/20"
                  style={{ backgroundColor: cursor.color }}
                >
                  {cursor.name}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
