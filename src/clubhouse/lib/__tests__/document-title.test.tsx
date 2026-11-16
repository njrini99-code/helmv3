import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentTitle } from '../document-title';

describe('a pushed screen names the window while it is up (PLAYER-04)', () => {
  it('sets "<name> · GolfHelm" and gives the route its title back as it leaves', () => {
    document.title = 'Roster · GolfHelm';
    const { rerender, unmount } = render(<DocumentTitle title="Cole Bennett" />);
    expect(document.title).toBe('Cole Bennett · GolfHelm');
    rerender(<DocumentTitle title="Eli Brandt" />);
    expect(document.title).toBe('Eli Brandt · GolfHelm');
    unmount();
    expect(document.title).toBe('Roster · GolfHelm');
  });

  it('leaves a title the route set meanwhile alone', () => {
    document.title = 'Roster · GolfHelm';
    const { unmount } = render(<DocumentTitle title="Cole Bennett" />);
    document.title = 'Stats · GolfHelm';
    unmount();
    expect(document.title).toBe('Stats · GolfHelm');
  });
});
