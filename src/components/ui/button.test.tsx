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
    expect(screen.getByRole('button')).toHaveClass('px-3', 'py-2', 'text-xs');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-6', 'py-3', 'text-base');
  });

  it('shows loading state', () => {
    render(<Button isLoading>Loading</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
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
    expect(screen.getByRole('button')).toHaveClass('text-warm-600');
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
