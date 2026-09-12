import type { AnchorHTMLAttributes } from 'react';
export default function Link({ prefetch: _prefetch, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) { return <a {...props}>{children}</a>; }
export const useLinkStatus = () => ({ pending: false });
