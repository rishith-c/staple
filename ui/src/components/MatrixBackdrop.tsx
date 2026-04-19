import { useEffect, useRef } from "react";

/** Half-width katakana + digits — readable at small size, “matrix” adjacent. */
const GLYPHS = "ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789".split("");

function pickChar() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "0";
}

type Stream = {
  x: number;
  head: number;
  speed: number;
  tail: number;
  headChar: string;
  bodyChars: string[];
  headSwap: number;
};

function initStreams(width: number, height: number, fontSize: number): Stream[] {
  const streams: Stream[] = [];
  const minGap = 56;
  const maxGap = 96;
  let x = fontSize;
  while (x < width - fontSize) {
    const tail = 3 + Math.floor(Math.random() * 5);
    streams.push({
      x: x + (Math.random() - 0.5) * 10,
      head: Math.random() * height * 1.2 - height * 0.2,
      speed: 16 + Math.random() * 26,
      tail,
      headChar: pickChar(),
      bodyChars: Array.from({ length: tail + 2 }, pickChar),
      headSwap: Math.random() * 2,
    });
    x += minGap + Math.random() * (maxGap - minGap);
  }
  return streams;
}

/**
 * Very light “digital rain” behind the main pane (dark mode only).
 * Sparse columns + low alpha so it stays atmospheric, not busy.
 */
export function MatrixBackdrop() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const paint = ctx;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fontSize = 13;
    const line = fontSize * 1.05;
    let streams: Stream[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    const targetFrameMs = 1000 / 12;

    function resize() {
      const root = wrapRef.current;
      const surface = canvasRef.current;
      if (!root || !surface) return;
      dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      width = root.clientWidth;
      height = root.clientHeight;
      surface.width = Math.max(1, Math.floor(width * dpr));
      surface.height = Math.max(1, Math.floor(height * dpr));
      surface.style.width = `${width}px`;
      surface.style.height = `${height}px`;
      paint.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      paint.textBaseline = "top";
      streams = initStreams(width, height, fontSize);
    }

    function drawStatic() {
      paint.clearRect(0, 0, width, height);
      for (const s of streams) {
        const anchor = (s.head % (height + line * 4)) - line * 2;
        for (let i = 0; i < s.tail; i++) {
          const yy = anchor - i * line;
          if (yy < -line || yy > height) continue;
          const alpha = i === 0 ? 0.055 : 0.022 * (1 - i / s.tail);
          paint.fillStyle = `rgba(74, 222, 128, ${alpha})`;
          const ch = i === 0 ? s.headChar : s.bodyChars[i - 1] ?? "·";
          paint.fillText(ch, s.x, yy);
        }
      }
    }

    function step(now: number) {
      raf = requestAnimationFrame(step);
      if (now - last < targetFrameMs) return;
      const dt = Math.min(48, now - last) / 1000;
      last = now;

      paint.clearRect(0, 0, width, height);
      for (const s of streams) {
        s.head += s.speed * dt;
        s.headSwap += dt;
        if (s.headSwap > 1.4) {
          s.headSwap = 0;
          s.headChar = pickChar();
        }
        if (s.head > height + line * s.tail) {
          s.head = -line * s.tail - Math.random() * height * 0.35;
          s.speed = 16 + Math.random() * 26;
          s.tail = 3 + Math.floor(Math.random() * 5);
          s.bodyChars = Array.from({ length: s.tail + 2 }, pickChar);
        }
        for (let i = 0; i < s.tail; i++) {
          const yy = s.head - i * line;
          if (yy < -line || yy > height) continue;
          const alpha = i === 0 ? 0.085 : 0.028 * (1 - i / s.tail);
          paint.fillStyle = `rgba(74, 222, 128, ${alpha})`;
          const ch = i === 0 ? s.headChar : s.bodyChars[i - 1] ?? "·";
          paint.fillText(ch, s.x, yy);
        }
      }
    }

    function sync() {
      cancelAnimationFrame(raf);
      if (width < 8 || height < 8) return;
      if (motion.matches) {
        drawStatic();
        return;
      }
      last = 0;
      raf = requestAnimationFrame(step);
    }

    const ro = new ResizeObserver(() => {
      resize();
      sync();
    });
    ro.observe(wrap);
    resize();
    sync();
    motion.addEventListener("change", sync);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      motion.removeEventListener("change", sync);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden dark:block"
      aria-hidden
    >
      <canvas ref={canvasRef} className="h-full w-full opacity-[0.38]" />
    </div>
  );
}
