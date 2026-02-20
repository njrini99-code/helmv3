'use client';

import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class DashboardErrorBoundary extends Component<Props, State> {
    override state: State = { hasError: false };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    override render() {
        if (this.state.hasError) {
            return this.props.fallback ?? (
                <div className="glass-standard rounded-2xl p-6 text-center">
                    <p className="text-sm text-warm-600 font-medium mb-2">
                        {this.props.name ?? 'Widget'} failed to load
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
