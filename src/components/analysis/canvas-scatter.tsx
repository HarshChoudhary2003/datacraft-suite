import { useEffect, useRef, useState } from "react";

interface DataPoint {
  x: number;
  y: number;
  label?: string;
  category?: string;
}

interface CanvasScatterProps {
  data: DataPoint[];
  xLabel?: string;
  yLabel?: string;
  title?: string;
  width?: number;
  height?: number;
  pointColor?: string;
}

export function CanvasScatter({
  data,
  xLabel = "X Axis",
  yLabel = "Y Axis",
  title = "Scatter Plot (Canvas 60 FPS)",
  height = 360,
  pointColor = "oklch(0.68 0.24 280)",
}: CanvasScatterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padding = { top: 30, right: 30, bottom: 45, left: 55 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    // Calculate bounds
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    // Draw Grid Lines & Axes
    ctx.strokeStyle = "rgba(150, 150, 150, 0.15)";
    ctx.lineWidth = 1;
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(160, 160, 170, 0.8)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    // Y ticks
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const ratio = i / ySteps;
      const yVal = minY + ratio * rangeY;
      const py = padding.top + plotH - ratio * plotH;

      ctx.beginPath();
      ctx.moveTo(padding.left, py);
      ctx.lineTo(w - padding.right, py);
      ctx.stroke();

      ctx.fillText(yVal.toFixed(1), padding.left - 8, py);
    }

    // X ticks
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xSteps = 6;
    for (let i = 0; i <= xSteps; i++) {
      const ratio = i / xSteps;
      const xVal = minX + ratio * rangeX;
      const px = padding.left + ratio * plotW;

      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + plotH);
      ctx.stroke();

      ctx.fillText(xVal.toFixed(1), px, padding.top + plotH + 8);
    }

    // Axis Labels
    ctx.fillStyle = "rgba(180, 180, 190, 0.9)";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(xLabel, padding.left + plotW / 2, h - 14);

    ctx.save();
    ctx.translate(14, padding.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Render Points
    ctx.fillStyle = pointColor;
    const radius = data.length > 50000 ? 1.5 : data.length > 10000 ? 2 : 3.5;
    const alpha = data.length > 50000 ? 0.35 : data.length > 10000 ? 0.5 : 0.75;

    ctx.globalAlpha = alpha;
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      const px = padding.left + ((p.x - minX) / rangeX) * plotW;
      const py = padding.top + plotH - ((p.y - minY) / rangeY) * plotH;

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [data, height, pointColor, xLabel, yLabel]);

  return (
    <div ref={containerRef} className="relative w-full neo p-4 rounded-2xl border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-bold text-sm text-foreground">{title}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Hardware-accelerated rendering ({data.length.toLocaleString()} points)
          </p>
        </div>
        <div className="flex items-center gap-1.5 neo-sm px-2.5 py-1 text-[11px] font-mono text-primary border border-primary/20">
          60 FPS Canvas
        </div>
      </div>

      <div className="relative w-full" style={{ height }}>
        <canvas ref={canvasRef} className="w-full h-full block rounded-xl" />
        {hoveredPoint && hoverPos && (
          <div
            className="absolute z-20 pointer-events-none neo-sm p-2 text-xs border border-primary/30 shadow-lg rounded-xl"
            style={{ left: hoverPos.x + 12, top: hoverPos.y - 30 }}
          >
            <div className="font-bold text-primary">{hoveredPoint.label ?? "Point"}</div>
            <div className="text-[11px] text-muted-foreground">
              {xLabel}: {hoveredPoint.x.toFixed(2)} | {yLabel}: {hoveredPoint.y.toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
