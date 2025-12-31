import { useState, useEffect, RefObject } from 'react';

interface MousePosition {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
}

export function useMousePosition(ref: RefObject<HTMLElement | null>): MousePosition {
  const [position, setPosition] = useState<MousePosition>({
    x: 0,
    y: 0,
    normalizedX: 0,
    normalizedY: 0,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Normalize to -1 to 1 range
      const normalizedX = (x / rect.width) * 2 - 1;
      const normalizedY = (y / rect.height) * 2 - 1;

      setPosition({ x, y, normalizedX, normalizedY });
    };

    element.addEventListener('mousemove', handleMouseMove);

    return () => {
      element.removeEventListener('mousemove', handleMouseMove);
    };
  }, [ref]);

  return position;
}
