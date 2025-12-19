'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color = '#0ea5e9',
  width = 100,
  height = 32,
  className
}: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation on mount
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || data.length < 2 || !isVisible) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution for retina displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate min/max for scaling
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // Prevent division by zero

    // Calculate points
    const points: [number, number][] = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return [x, y];
    });

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `${color}40`); // 25% opacity
    gradient.addColorStop(1, `${color}00`); // 0% opacity

    if (points.length > 0 && points[0]) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);

      for (let i = 1; i < points.length; i++) {
        const point = points[i];
        if (point) ctx.lineTo(point[0], point[1]);
      }

      // Complete the fill area
      const lastPoint = points[points.length - 1];
      const firstPoint = points[0];
      if (lastPoint && firstPoint) {
        ctx.lineTo(lastPoint[0], height);
        ctx.lineTo(firstPoint[0], height);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw line
        ctx.beginPath();
        ctx.moveTo(firstPoint[0], firstPoint[1]);

        for (let i = 1; i < points.length; i++) {
          const point = points[i];
          if (point) ctx.lineTo(point[0], point[1]);
        }
      }
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, [data, color, width, height, isVisible]);

  if (data.length < 2) return null;

  return (
    <canvas
      ref={canvasRef}
      className={cn('transition-opacity duration-500', isVisible ? 'opacity-100' : 'opacity-0', className)}
    />
  );
}
