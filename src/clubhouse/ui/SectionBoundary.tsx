'use client';

import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { chReport } from '../lib/track';
import { InlineNotice } from './Notices';

/**
 * Contains a crash to one section of a page. The rest of the screen keeps
 * working, the coach sees what broke in plain words with Try again, and the
 * error goes to Sentry tagged with its surface (home.leaderboard, ...).
 *
 * An error boundary only catches in the browser. The Suspense inside it
 * covers the server render: a section that throws there is left out of the
 * HTML and rendered again in the browser, where this boundary catches it.
 * Without it, one section's crash on first load fails the whole page.
 */
export class SectionBoundary extends Component<
  { surface: string; label: string; children: ReactNode; /** Catalog number of the crash notice. */ code?: string },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    chReport(error, { surface: this.props.surface, severity: 'high', extra: { componentStack: info.componentStack ?? undefined } });
  }

  override render() {
    if (!this.state.failed) return <Suspense fallback={null}>{this.props.children}</Suspense>;
    return (
      <InlineNotice
        code={this.props.code}
        title={`${this.props.label} couldn’t be shown.`}
        body="The rest of the page is fine. This has been reported automatically."
        onRetry={() => this.setState({ failed: false })}
      />
    );
  }
}
