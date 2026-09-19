import type { ImgHTMLAttributes } from 'react';
// Browser fixture adapter for the framework image optimizer; real local assets.
export default function Image({ priority: _priority, unoptimized: _unoptimized, fill, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; unoptimized?: boolean; fill?: boolean }) {
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img {...props} style={{ ...(fill ? { position: 'absolute', width: '100%', height: '100%', inset: 0 } : {}), ...props.style }} />;
}
