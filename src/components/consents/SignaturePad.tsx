import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

export interface SignaturePadHandle {
  /** PNG data URL, or null when nothing has been drawn. */
  toDataUrl: () => string | null;
  clear: () => void;
}

/**
 * Finger, stylus or mouse signature box. Works on phones and tablets (pointer events,
 * no page scrolling while signing) and draws crisply on high-density screens.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void; height?: number }>(
  function SignaturePad({ onChange, height = 180 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const strokes = useRef(0);
    const [hasInk, setHasInk] = useState(false);

    const setup = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
      strokes.current = 0;
      setHasInk(false);
      onChange?.(false);
    }, [height, onChange]);

    useEffect(() => {
      setup();
      // Resizing clears the canvas, so only redo it when the width really changes (rotating a tablet).
      let width = canvasRef.current?.getBoundingClientRect().width;
      const onResize = () => {
        const w = canvasRef.current?.getBoundingClientRect().width;
        if (w && w !== width) { width = w; setup(); }
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [setup]);

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = point(e);
      const ctx = e.currentTarget.getContext('2d');
      if (ctx && last.current) {
        ctx.beginPath();
        ctx.arc(last.current.x, last.current.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      }
    };

    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current || !last.current) return;
      const ctx = e.currentTarget.getContext('2d');
      if (!ctx) return;
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    };

    const up = () => {
      if (!drawing.current) return;
      drawing.current = false;
      last.current = null;
      strokes.current += 1;
      if (!hasInk) { setHasInk(true); onChange?.(true); }
    };

    useImperativeHandle(ref, () => ({
      toDataUrl: () => {
        const canvas = canvasRef.current;
        if (!canvas || strokes.current === 0) return null;
        // White background so the signature prints and shows well everywhere.
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = canvas.height;
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(canvas, 0, 0);
        return out.toDataURL('image/png');
      },
      clear: setup,
    }), [setup]);

    return (
      <div className="relative">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: 'none' }}
          className="w-full rounded-control border-2 border-dashed border-line bg-white cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          aria-label="Signature area. Sign with your finger, stylus or mouse."
          role="img"
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Sign here</span>
        )}
        <div className="absolute left-4 right-4 bottom-8 border-b border-slate-300 pointer-events-none" aria-hidden="true" />
        {hasInk && (
          <button type="button" onClick={setup}
            className="absolute top-2 right-2 inline-flex items-center gap-1 h-8 px-2.5 rounded-control bg-white/90 border border-line text-[12px] font-medium text-slate-600 hover:bg-white">
            <Eraser className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>
    );
  },
);
