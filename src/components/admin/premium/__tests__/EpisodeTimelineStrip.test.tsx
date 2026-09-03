import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EpisodeTimelineStrip } from '../EpisodeTimelineStrip';
import { deriveEpisodes } from '@/lib/admin/incidents/episodes';

describe('EpisodeTimelineStrip', () => {
  it('renders nothing for an empty episode list', () => {
    const { container } = render(<EpisodeTimelineStrip episodes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one segment per episode with a count label', () => {
    const episodes = deriveEpisodes({
      firstSeen: '2026-08-25T19:08:00Z',
      occurrences: [{ at: '2026-08-25T19:08:00Z' }, { at: '2026-09-02T12:07:00Z' }],
      resolutions: [{ resolvedAt: '2026-08-25T23:45:00Z', fixedInSha: '8e4c5b7d' }],
    });
    render(<EpisodeTimelineStrip episodes={episodes} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('2 episodes')).toBeInTheDocument();
  });

  it('marks an incomplete reconstruction with a trailing "+"', () => {
    const episodes = deriveEpisodes({
      firstSeen: '2026-08-25T19:08:00Z',
      occurrences: [{ at: '2026-08-25T19:08:00Z' }],
      resolutions: [],
    });
    render(<EpisodeTimelineStrip episodes={episodes} incomplete />);
    expect(screen.getByText('1 episode+')).toBeInTheDocument();
  });
});
