'use client';

import { RouteErrorView, type RouteErrorKind } from '../ui/Notices';

export function PreviewError({ kind }: { kind: RouteErrorKind }) {
  return <RouteErrorView kind={kind} isRetrying={false} retryCount={0} onRetry={() => {}} homePath="/golf" digest="1234567890" />;
}
