import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayTeeCard, resolveTeeSwatch } from '@/components/fairway/pages/rounds-new/FairwayTeeCard';
import type { GolfCourseTee } from '@/lib/types/golf-course';

const base: GolfCourseTee = {
  id: 't1',
  course_id: 'c1',
  tee_name: 'Blue',
  normalized_tee_name: 'blue',
  tee_color: null,
  category: 'mens',
  total_yards: 6650,
  total_par: 72,
  course_rating: 72.1,
  slope_rating: 133,
  holes_count: 18,
  source: null,
  is_draft: false,
  created_by_user_id: null,
  created_by_team_id: null,
  last_edited_by_user_id: null,
  last_edited_by_team_id: null,
  last_edited_at: null,
  deleted_at: null,
  created_at: '',
  updated_at: '',
};

const tee = (o: Partial<GolfCourseTee> = {}): GolfCourseTee => ({ ...base, ...o });

/**
 * The tee marker is an IDENTIFIER, not decoration — it is the colour of the
 * post you walk up to on the course. So the resolver has to be right about
 * which word is a colour, and honest when nothing says.
 */
describe('resolveTeeSwatch', () => {
  it('prefers the tee_color column', () => {
    expect(resolveTeeSwatch({ tee_color: 'Red', tee_name: 'Championship' }).key).toBe('red');
  });

  it('falls back to the tee name, because tees are named by their colour', () => {
    expect(resolveTeeSwatch({ tee_color: null, tee_name: 'Blue' }).key).toBe('blue');
    expect(resolveTeeSwatch({ tee_color: null, tee_name: 'Back Tees / White' }).key).toBe('white');
  });

  it('matches whole words only', () => {
    // The bug this guards: a substring scan paints "Silverado" silver and
    // "Greenbrier" green — confidently wrong about a physical marker.
    expect(resolveTeeSwatch({ tee_color: null, tee_name: 'Silverado' }).key).toBeNull();
    expect(resolveTeeSwatch({ tee_color: null, tee_name: 'Greenbrier' }).key).toBeNull();
    expect(resolveTeeSwatch({ tee_color: null, tee_name: 'Redwood' }).key).toBeNull();
  });

  it('honours a literal hex in tee_color', () => {
    const r = resolveTeeSwatch({ tee_color: '#1a2b3c', tee_name: 'Members' });
    expect(r.hex).toBe('#1a2b3c');
  });

  it('returns nothing rather than inventing a colour', () => {
    expect(resolveTeeSwatch({ tee_color: null, tee_name: 'Members' })).toEqual({
      hex: null,
      key: null,
    });
  });
});

describe('FairwayTeeCard', () => {
  it('leads with the yardage — the number that separates one tee from the next', () => {
    render(<FairwayTeeCard tee={tee()} longestYards={7075} onClick={vi.fn()} />);
    expect(screen.getByText('6,650')).toBeInTheDocument();
  });

  it('surfaces rating and slope, which the old row never showed at all', () => {
    render(<FairwayTeeCard tee={tee()} longestYards={7075} onClick={vi.fn()} />);
    expect(screen.getByText('Rating')).toBeInTheDocument();
    expect(screen.getByText('72.1')).toBeInTheDocument();
    expect(screen.getByText('Slope')).toBeInTheDocument();
    expect(screen.getByText('133')).toBeInTheDocument();
  });

  it('says so honestly when there is no rating on file', () => {
    render(
      <FairwayTeeCard
        tee={tee({ course_rating: null, slope_rating: null })}
        longestYards={7075}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/no rating on file/i)).toBeInTheDocument();
  });

  it('scales the length bar against the longest tee at this course', () => {
    const { container } = render(
      <FairwayTeeCard tee={tee({ total_yards: 5000 })} longestYards={10000} onClick={vi.fn()} />,
    );
    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar.style.width).toBe('50%');
  });

  it('floors the bar so the shortest tee is still a bar, not a sliver', () => {
    const { container } = render(
      <FairwayTeeCard tee={tee({ total_yards: 100 })} longestYards={10000} onClick={vi.fn()} />,
    );
    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar.style.width).toBe('25%');
  });

  it('clamps the bar so a bad longest value cannot overflow the track', () => {
    const { container } = render(
      <FairwayTeeCard tee={tee({ total_yards: 9000 })} longestYards={100} onClick={vi.fn()} />,
    );
    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('omits the bar entirely when there is nothing to compare against', () => {
    const { container } = render(
      <FairwayTeeCard tee={tee({ total_yards: null })} onClick={vi.fn()} />,
    );
    expect(container.querySelector('[style*="width"]')).toBeNull();
    expect(screen.getByText(/length not set/i)).toBeInTheDocument();
  });

  it('names the tee for screen readers with its length', () => {
    render(<FairwayTeeCard tee={tee()} longestYards={7075} onClick={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /play the blue tees, 6,650 yards/i }),
    ).toBeInTheDocument();
  });

  it('is the whole card, and does not fire when disabled', () => {
    const onClick = vi.fn();
    render(<FairwayTeeCard tee={tee()} longestYards={7075} disabled onClick={onClick} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    btn.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
