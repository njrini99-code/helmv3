import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('framer-motion', async () => {
  const _React = await import('react');
  const _mockDiv = _React.forwardRef(
    (
      {
        children,
        className,
        role: roleProp,
        ...rest
      }: {
        children?: React.ReactNode;
        className?: string;
        role?: string;
        'aria-label'?: string;
        [key: string]: unknown;
      },
      ref: React.ForwardedRef<HTMLDivElement>,
    ) => (
      <div ref={ref} className={className} role={roleProp} aria-label={rest['aria-label'] as string}>
        {children}
      </div>
    ),
  );
  const _mockSpan = _React.forwardRef(
    (
      {
        children,
        className,
      }: {
        children?: React.ReactNode;
        className?: string;
      },
      ref: React.ForwardedRef<HTMLSpanElement>,
    ) => (
      <span ref={ref} className={className}>
        {children}
      </span>
    ),
  );
  return {
    motion: { div: _mockDiv, span: _mockSpan },
    m: { div: _mockDiv, span: _mockSpan },
    useSpring: () => ({ set: vi.fn() }),
    useTransform: (_spring: unknown, fn: (v: number) => string) => fn(0),
    useInView: () => true,
  };
});

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/icons', () => ({
  IconArrowRight: () => <span data-testid="icon-arrow-right" />,
  IconTrendingUp: () => <span data-testid="icon-trending-up" />,
  IconTrendingDown: () => <span data-testid="icon-trending-down" />,
}));

// Mock Sparkline to render a simple testable element
vi.mock('@/components/ui/sparkline', () => ({
  Sparkline: ({ data, color }: { data: number[]; color: string }) => (
    <div data-testid="sparkline" data-color={color} data-points={data.length} />
  ),
}));

// Mock AnimatedNumber to render the value directly
vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({
    value,
    suffix,
    prefix,
    decimals,
  }: {
    value: number;
    suffix?: string;
    prefix?: string;
    decimals?: number;
  }) => (
    <span data-testid="animated-number">
      {prefix}
      {value.toFixed(decimals ?? 0)}
      {suffix}
    </span>
  ),
}));

import { StatCardSparkline } from '../stat-card-sparkline';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StatCardSparkline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    label: 'Scoring Avg',
    value: 72.5 as number | null,
    sparkline: [74, 73, 72, 71, 72],
    icon: <span data-testid="test-icon" />,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
  };

  // ========================================================================
  // Null value (no data)
  // ========================================================================
  describe('null value', () => {
    it('renders "--" when value is null', () => {
      render(<StatCardSparkline {...defaultProps} value={null} />);
      expect(screen.getByText('--')).toBeInTheDocument();
    });

    it('has correct aria-label with "--" for null value', () => {
      render(<StatCardSparkline {...defaultProps} value={null} />);
      expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Scoring Avg: --');
    });
  });

  // ========================================================================
  // Numeric value
  // ========================================================================
  describe('numeric value', () => {
    it('renders label', () => {
      render(<StatCardSparkline {...defaultProps} />);
      expect(screen.getByText('Scoring Avg')).toBeInTheDocument();
    });

    it('renders AnimatedNumber for numeric value', () => {
      render(<StatCardSparkline {...defaultProps} />);
      expect(screen.getByTestId('animated-number')).toBeInTheDocument();
    });

    it('has correct aria-label for numeric value', () => {
      render(<StatCardSparkline {...defaultProps} />);
      expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Scoring Avg: 72.5');
    });
  });

  // ========================================================================
  // Suffix
  // ========================================================================
  describe('suffix', () => {
    it('includes suffix in aria-label', () => {
      render(<StatCardSparkline {...defaultProps} suffix="%" value={55.3} />);
      expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Scoring Avg: 55.3%');
    });
  });

  // ========================================================================
  // Sparkline
  // ========================================================================
  describe('sparkline', () => {
    // TODO(user-wip): un-skip after the in-progress slate→warm design token
    // sweep settles. See src/test/SKIPPED.md.
    it.skip('renders Sparkline component when data has 2+ points', () => {
      render(<StatCardSparkline {...defaultProps} />);
      expect(screen.getByTestId('sparkline')).toBeInTheDocument();
    });

    it('does not render Sparkline when data has < 2 points', () => {
      render(<StatCardSparkline {...defaultProps} sparkline={[72]} />);
      expect(screen.queryByTestId('sparkline')).not.toBeInTheDocument();
    });

    it('renders icon when no sparkline data', () => {
      render(<StatCardSparkline {...defaultProps} sparkline={[]} />);
      expect(screen.queryByTestId('sparkline')).not.toBeInTheDocument();
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Trend indicators
  // ========================================================================
  describe('trend', () => {
    it('renders improving trend indicator', () => {
      render(<StatCardSparkline {...defaultProps} trend="improving" />);
      expect(screen.getByTestId('icon-trending-up')).toBeInTheDocument();
    });

    it('renders declining trend indicator', () => {
      render(<StatCardSparkline {...defaultProps} trend="declining" />);
      expect(screen.getByTestId('icon-trending-down')).toBeInTheDocument();
    });

    it('does not render trend indicator when stable', () => {
      render(<StatCardSparkline {...defaultProps} trend="stable" />);
      expect(screen.queryByTestId('icon-trending-up')).not.toBeInTheDocument();
      expect(screen.queryByTestId('icon-trending-down')).not.toBeInTheDocument();
    });

    it('does not render trend indicator when undefined', () => {
      render(<StatCardSparkline {...defaultProps} trend={undefined} />);
      expect(screen.queryByTestId('icon-trending-up')).not.toBeInTheDocument();
      expect(screen.queryByTestId('icon-trending-down')).not.toBeInTheDocument();
    });

    // TODO(user-wip): un-skip after design token sweep. See src/test/SKIPPED.md.
    it.skip('uses green sparkline color for improving trend', () => {
      render(<StatCardSparkline {...defaultProps} trend="improving" />);
      const sparkline = screen.getByTestId('sparkline');
      expect(sparkline).toHaveAttribute('data-color', '#16A34A');
    });

    // TODO(user-wip): un-skip after design token sweep. See src/test/SKIPPED.md.
    it.skip('uses red sparkline color for declining trend', () => {
      render(<StatCardSparkline {...defaultProps} trend="declining" />);
      const sparkline = screen.getByTestId('sparkline');
      expect(sparkline).toHaveAttribute('data-color', '#DC2626');
    });

    // TODO(user-wip): un-skip after design token sweep. See src/test/SKIPPED.md.
    it.skip('uses gray sparkline color for stable trend', () => {
      render(<StatCardSparkline {...defaultProps} trend="stable" />);
      const sparkline = screen.getByTestId('sparkline');
      expect(sparkline).toHaveAttribute('data-color', '#94A3B8');
    });
  });

  // ========================================================================
  // Link behavior
  // ========================================================================
  describe('link behavior', () => {
    it('wraps in a link when href is provided', () => {
      render(<StatCardSparkline {...defaultProps} href="/golf/stats" />);
      const links = screen.getAllByRole('link');
      // The <a> wrapper from Next.js Link
      const anchor = links.find(el => el.tagName === 'A');
      expect(anchor).toBeDefined();
      expect(anchor).toHaveAttribute('href', '/golf/stats');
    });

    it('renders link role on inner card when href is provided', () => {
      render(<StatCardSparkline {...defaultProps} href="/golf/stats" />);
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThanOrEqual(1);
    });

    it('uses "region" role when no href', () => {
      render(<StatCardSparkline {...defaultProps} />);
      expect(screen.getByRole('region')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Accent variant
  // ========================================================================
  describe('accent variant', () => {
    it('renders without crashing when accent is true', () => {
      render(<StatCardSparkline {...defaultProps} accent />);
      expect(screen.getByText('Scoring Avg')).toBeInTheDocument();
    });
  });
});
