import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import { Button, IconButton, ButtonGroup, ButtonGroupOption } from './button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies primary variant by default', () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-primary-600');
  });

  it('applies secondary variant when specified', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-white');
  });

  it('applies danger variant when specified', () => {
    render(<Button variant="danger">Delete</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('text-red-600');
  });

  it('applies different sizes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-3', 'py-2.5', 'text-xs');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-6', 'py-3', 'text-base');
  });

  // UN-SKIPPED. This asserted the OLD behaviour — that the label is removed while
  // loading — and was parked pending "whether children render alongside the
  // spinner" (src/test/SKIPPED.md:27). That question is settled, and the component
  // itself is the authority: its comment says the label is kept DELIBERATELY,
  // because replacing it with a placeholder "causes layout shift and loses context
  // for the user". Re-enabled with the assertions inverted to the decided
  // behaviour, rather than left dormant.
  it('shows loading state: keeps the label, adds a spinner, and disables', () => {
    render(<Button isLoading>Loading</Button>);
    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    // The iOS-native pattern: label STAYS. This is the inverted assertion.
    expect(screen.getByText('Loading')).toBeInTheDocument();
    // Announced to assistive tech, not just visually spinning.
    expect(button).toHaveAttribute('aria-busy', 'true');
    // A spinner is actually rendered, so "loading" is not merely a disabled button.
    expect(button.querySelector('svg.animate-spin')).not.toBeNull();
    expect(button).toHaveClass('pointer-events-none', 'cursor-wait');
  });

  it('is not aria-busy when it is merely disabled', () => {
    // Guards the pair above from passing for the wrong reason: `disabled` alone
    // must not look like loading.
    render(<Button disabled>Idle</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button.querySelector('svg.animate-spin')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // `asChild` (added 2026-07-30). Its SOURCE shape is guarded by
  // src/test/dom-nesting/no-nested-interactive.test.ts, and its CSP-adjacent
  // scoping by src/lib/security — but nothing exercised what it actually renders.
  // These cover the three ways it can go wrong at runtime.
  // ---------------------------------------------------------------------------
  describe('asChild', () => {
    it('renders exactly ONE element — the child, with no wrapper button', () => {
      // The whole point: `<Button asChild><a/></Button>` must emit one <a>, not an
      // <a> inside a <button>. A wrapper here is the invalid-HTML/hydration bug the
      // prop exists to avoid.
      const { container } = render(
        <Button asChild>
          <a href="/somewhere">Go</a>
        </Button>,
      );
      expect(container.querySelectorAll('button')).toHaveLength(0);
      const anchors = container.querySelectorAll('a');
      expect(anchors).toHaveLength(1);
      expect(anchors[0]).toHaveAttribute('href', '/somewhere');
    });

    it('puts its styling on the child, so the child IS the styled element', () => {
      render(
        <Button asChild variant="secondary">
          <a href="/x">Styled</a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Styled' });
      expect(link).toHaveClass('bg-white');
      // `relative overflow-hidden` is what makes the ripple host correct on the
      // child; without it the ripple would paint outside the element.
      expect(link).toHaveClass('relative', 'overflow-hidden');
    });

    it('does NOT forward `disabled` to a non-button child, and uses ARIA instead', () => {
      // `disabled` is invalid on <a>. Forwarding it would render a bogus attribute
      // AND leave the link clickable, which is the failure mode worth pinning.
      render(
        <Button asChild disabled>
          <a href="/x">Nope</a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Nope' });
      expect(link).not.toHaveAttribute('disabled');
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveClass('pointer-events-none');
    });

    it('does not inject icon spans, since Slot takes exactly one child', () => {
      // Documented constraint: leftIcon/rightIcon and the spinner cannot be added
      // as siblings of an arbitrary single child, so they are dropped rather than
      // silently corrupting the tree. Call sites compose them inside the child.
      const { container } = render(
        <Button asChild leftIcon={<span data-testid="icon" />}>
          <a href="/x">Only me</a>
        </Button>,
      );
      expect(container.querySelectorAll('a')).toHaveLength(1);
      expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
      expect(screen.getByRole('link')).toHaveTextContent('Only me');
    });
  });

  it('can be disabled', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    const { user } = render(<Button onClick={handleClick}>Click</Button>);
    
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    const { user } = render(<Button disabled onClick={handleClick}>Click</Button>);
    
    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('renders with children', () => {
    render(<IconButton>🔍</IconButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('applies default variant', () => {
    render(<IconButton>Icon</IconButton>);
    expect(screen.getByRole('button')).toHaveClass('text-warm-500');
  });

  it('applies primary variant', () => {
    render(<IconButton variant="primary">Icon</IconButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary-600');
  });
});

describe('ButtonGroup', () => {
  it('renders children', () => {
    render(
      <ButtonGroup>
        <ButtonGroupOption>Option 1</ButtonGroupOption>
        <ButtonGroupOption>Option 2</ButtonGroupOption>
      </ButtonGroup>
    );
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });
});

describe('ButtonGroupOption', () => {
  it('applies active styles when active', () => {
    render(<ButtonGroupOption active>Active</ButtonGroupOption>);
    expect(screen.getByRole('button')).toHaveClass('bg-white', 'shadow-sm');
  });

  it('applies inactive styles when not active', () => {
    render(<ButtonGroupOption>Inactive</ButtonGroupOption>);
    expect(screen.getByRole('button')).toHaveClass('text-warm-600');
    expect(screen.getByRole('button')).not.toHaveClass('bg-white');
  });
});
