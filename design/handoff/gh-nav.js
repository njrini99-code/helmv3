/* GolfHelm prototype · navigation
   Single source of truth for the desktop sidebar (GH.items) and the mobile tab bar (GH.tabs).
   Every entry points at a designed screen. Sections that are not designed yet are listed in Index.html. */
(function () {
  const GH = (window.GH = window.GH || {});
  const meta = (n) => { const m = document.querySelector('meta[name="' + n + '"]'); return m ? m.content : ''; };
  GH.role = meta('gh-role') || 'coach';
  GH.page = meta('gh-page') || '';
  GH.nav = {
    coach: [
      { id: 'home', label: 'Home', icon: 'house', href: 'Coach - Home.html' },
      { id: 'coachhelm', label: 'CoachHelm', icon: 'sparkles', href: 'Coach - CoachHelm.html' },
      { id: 'calendar', label: 'Calendar', icon: 'calendar-days', href: 'Coach - Calendar.html' },
      { id: 'hub', label: 'Team Hub', icon: 'users-round', href: 'Coach - Team Hub.html' },
      { id: 'messages', label: 'Messages', icon: 'message-square', count: 3, href: 'Coach - Messages.html' },
      { id: 'roster', label: 'Roster', icon: 'users', section: 'Team', href: 'Coach - Roster.html' },
      { id: 'stats', label: 'Stats', icon: 'chart-column', section: 'Team', href: 'Coach - Stats.html' },
      { id: 'qualifiers', label: 'Qualifiers', icon: 'medal', section: 'Team', href: 'Coach - Qualifiers.html' },
    ],
    player: [
      { id: 'home', label: 'Home', icon: 'house', href: 'Player - Home.html' },
      { id: 'coachhelm', label: 'CoachHelm', icon: 'sparkles', href: 'Player - CoachHelm.html' },
      { id: 'hub', label: 'Team Hub', icon: 'users-round', count: 3, href: 'Player - Team Hub.html' },
      { id: 'rounds', label: 'Rounds', icon: 'flag', section: 'My game', href: 'Player - Rounds.html' },
      { id: 'classes', label: 'Classes', icon: 'graduation-cap', section: 'School', href: 'Player - Classes.html' },
    ],
  };
  GH.items = (role) => GH.nav[role || GH.role].map(({ href, ...item }) => item);
  GH.href = (id, role) => { const it = GH.nav[role || GH.role].find((i) => i.id === id); return it ? it.href : null; };
  GH.go = (id) => { if (id === GH.page) return; const h = GH.href(id); if (h) location.href = h; };
  // Mobile tab bar: four destinations plus More (More opens a sheet with the rest of the sidebar).
  GH.tabs = {
    coach: [['home', 'house', 'Home'], ['helm', 'sparkles', 'CoachHelm'], ['calendar', 'calendar-days', 'Calendar'], ['stats', 'chart-column', 'Stats'], ['more', 'layout-grid', 'More']],
    player: [['home', 'house', 'Home'], ['helm', 'sparkles', 'CoachHelm'], ['rounds', 'flag', 'Rounds'], ['hub', 'users-round', 'Team Hub'], ['more', 'layout-grid', 'More']],
  };
})();
