'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { chReport } from '../lib/track';
import { InlineNotice } from './Notices';

/**
 * Contains a crash to one section of a page. The rest of the screen keeps
 * working, the coach sees what broke in plain words with Try again, and the
 * error goes to Sentry tagged with its surface (home.leaderboard, ...).
 */
export class SectionBoundary extends Component<
  { surface: string; label: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    chReport(error, { surface: this.props.surface, severity: 'high', extra: { componentStack: info.componentStack ?? undefined } });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <InlineNotice
        title={`${this.props.label} couldn’t be shown.`}
        body="The rest of the page is fine. This has been reported automatically."
        onRetry={() => this.setState({ failed: false })}
      />
    );
  }
}
