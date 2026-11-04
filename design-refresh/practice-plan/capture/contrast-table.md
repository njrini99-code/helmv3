# Contrast table: CoachHelm practice plans

Every text and background pair the design page draws, measured by `extract.js` over every capture state in light and dark, composited over the real background. Target 4.9:1 for text, 3:1 for large text and marks (SHARED-4). All pass. 04 §3 has the same table with notes.

| Theme | Text or mark | Background | Lowest ratio | Where |
|---|---|---|---|---|
| light | `--ch-seg-on-ink` #F6F1E4 | segmented chip, #1d6b45 top to #145635 bottom | 5.7 at the top edge, 6.6 at the label centre | `button < seg` selected. The label sits on the chip, a sibling element, so the script reads the well behind it |
| dark | `--ch-seg-on-ink` #F6F1E4 | segmented chip, #2a7d53 top to #1d613f bottom | 4.5 at the top edge, 5.4 at the label centre | the same. The build uses today's `.ch-seg` (9.6:1 in DESIGN_LANGUAGE), so this page-only shade is not built |
| light | `--ch-loss` #9A5700 | `--ch-well-bg-flat` #F6F4EE | 5.1 | `span.v.lo` |
| light | `--ch-loss` #9A5700 | `--ch-card-bg` #FFFEFB | 5.6 | `span.neg` |
| light | `--ch-text-tertiary` #5F5C55 | `--ch-grouped-bg` #F2F0E9 | 5.8 | `span.ts` |
| light | `--ch-text-secondary` #46433D | `#CBCFC4` | 6.2 | `span` |
| light | `--ch-gain` #14613D | `--ch-gain-tint` #E8EEE8 | 6.3 | `svg` |
| light | white #FFFFFF | `--ch-cp-pressure (new)` #1F6B45 | 6.5 | `i.gd.g-A` |
| light | `--ch-text-tertiary` #5F5C55 | `--ch-card-bg` #FFFEFB | 6.6 | `svg.chev` |
| light | white #FFFFFF | `#2F5B7E` | 7.2 | `i.gd.g-B` |
| light | `--ch-accent` #155A39 | `--ch-grouped-bg` #F2F0E9 | 7.2 | `svg` |
| light | `--ch-seg-on-ink` #F6F1E4 | `--ch-accent` #155A39 | 7.3 | `div.msg-me` |
| light | white #FFFFFF | `#654A7E` | 7.4 | `i.gd.g-C` |
| light | `--ch-accent` #155A39 | `--ch-well-bg-flat` #F6F4EE | 7.5 | `button.btn-s` |
| light | `--ch-text-secondary` #46433D | `--ch-seg-well` #E7E2D6 | 7.6 | `button` |
| light | `--ch-seg-on-ink` #F6F1E4 | `--seg-on-bot` #145635 | 7.7 | `span.on` |
| light | `--ch-accent` #155A39 | `--ch-card-bg` #FFFEFB | 8.2 | `svg` |
| light | `--ch-card-bg` #FFFEFB | `--ch-accent` #155A39 | 8.2 | `svg` |
| light | white #FFFFFF | `--ch-accent` #155A39 | 8.2 | `em.tagr` |
| light | `--ch-champagne` #D8C79B | `--ch-frame` #0A331F | 8.3 | `button.back` |
| light | `--ch-frame` #0A331F | `--ch-champagne` #D8C79B | 8.3 | `i` |
| light | `--ch-text-secondary` #46433D | `--ch-flat-tint` #EFEDE7 | 8.4 | `span.nx` |
| light | `--ch-on-frame` #F4EEDD | `#264936` | 8.6 | `a.on` |
| light | `--ch-text-secondary` #46433D | `--ch-grouped-bg` #F2F0E9 | 8.6 | `span` |
| light | `--ch-feature-ink-2` #D3D9CB | `--ch-feature-bg` #0B3A25 | 8.8 | `div.m` |
| light | `#D0D0BC` | `--ch-frame` #0A331F | 8.9 | `svg` |
| light | `--ch-text-secondary` #46433D | `--ch-well-bg-flat` #F6F4EE | 9.0 | `div.vh` |
| light | `--ch-text-secondary` #46433D | `#FBF9F4` | 9.3 | `svg` |
| light | `sidebar ink 2` #CFD6C8 | `--ch-frame` #0A331F | 9.4 | `a` |
| light | `#47443D` | `--ch-card-bg` #FFFEFB | 9.6 | `span` |
| light | `--ch-text-secondary` #46433D | `--ch-card-bg` #FFFEFB | 9.8 | `div.field` |
| light | `--ch-text-primary` #1C1B18 | `--ch-champagne` #D8C79B | 10.3 | `span.badge` |
| light | `--ch-text-primary` #1C1B18 | `#CBCFC4` | 10.8 | `div.top` |
| light | `--ch-on-frame` #F4EEDD | `--ch-feature-bg` #0B3A25 | 11.0 | `span.pp-mark` |
| light | `--ch-feature-ink` #F4F1E8 | `--ch-feature-bg` #0B3A25 | 11.3 | `div.t` |
| light | `--ch-feature-bg` #0B3A25 | `--ch-feature-ink` #F4F1E8 | 11.3 | `button.btn-p` |
| light | `--ch-on-frame` #F4EEDD | `--ch-frame` #0A331F | 12.0 | `span` |
| light | `--ch-text-primary` #1C1B18 | `#E4EEE7` | 14.5 | `div.gh` |
| light | `--ch-text-primary` #1C1B18 | `--ch-flat-tint` #EFEDE7 | 14.7 | `i.c` |
| light | `--ch-text-primary` #1C1B18 | `#F1EEE6` | 14.8 | `span.all` |
| light | `--ch-text-primary` #1C1B18 | `--ch-grouped-bg` #F2F0E9 | 15.1 | `div.who` |
| light | `--ch-text-primary` #1C1B18 | `--ch-well-bg-flat` #F6F4EE | 15.7 | `button.qo` |
| light | `--ch-on-frame` #F4EEDD | `#0D1611` | 15.9 | `div.tm` |
| light | `--ch-text-primary` #1C1B18 | `#FBF9F4` | 16.3 | `span.tt` |
| light | `--ch-text-primary` #1C1B18 | `--ch-card-bg` #FFFEFB | 17.1 | `span.t.tl` |
| dark | `#9A5700` | `#FFFEFB` | 5.6 | `span.neg` |
| dark | `--ch-seg-on-ink` #F6F1E4 | `--ch-btn-primary-bg` #1F6B45 | 5.7 | `div.msg-me` |
| dark | `#46433D` | `#CAC9C1` | 6.0 | `span` |
| dark | `#14613D` | `#E8EEE8` | 6.3 | `span.changed` |
| dark | `--ch-grouped-bg` #0E120F | `--ch-cp-skill (new)` #6E9BC0 | 6.4 | `i.gd.g-B` |
| dark | `--ch-grouped-bg` #0E120F | `--ch-cp-pressure (new)` #4FA877 | 6.5 | `i.gd.g-A` |
| dark | `#FFFFFF` | `--ch-btn-primary-bg` #1F6B45 | 6.5 | `i.gd.g-A` |
| dark | `--ch-seg-on-ink` #F6F1E4 | `--seg-on-bot` #1D613F | 6.6 | `span.on` |
| dark | `--ch-gain` #7CC79B | `--ch-gain-tint` #1E3326 | 6.7 | `svg` |
| dark | `--ch-text-tertiary` #ADA697 | `--ch-card-bg` #191E1A | 7.0 | `svg.chev` |
| dark | `#FFFFFF` | `#2F5B7E` | 7.2 | `i.gd.g-B` |
| dark | `#FFFFFF` | `#654A7E` | 7.4 | `i.gd.g-C` |
| dark | `--ch-grouped-bg` #0E120F | `--gC` #B49ACB | 7.6 | `i.gd.g-C` |
| dark | `--ch-text-tertiary` #ADA697 | `--ch-grouped-bg` #0E120F | 7.8 | `span.ts` |
| dark | `#155A39` | `#FFFEFB` | 8.2 | `b` |
| dark | `#FFFFFF` | `#155A39` | 8.2 | `em.tagr` |
| dark | `#0A331F` | `--ch-champagne` #D8C79B | 8.3 | `i` |
| dark | `--ch-feature-ink-2` #D3D9CB | `--ch-feature-bg` #123D29 | 8.4 | `div.m` |
| dark | `--ch-gain` #7CC79B | `--ch-card-bg` #191E1A | 8.4 | `svg` |
| dark | `--ch-card-bg` #191E1A | `--ch-gain` #7CC79B | 8.4 | `svg` |
| dark | `--ch-loss` #E7AE57 | `--ch-card-bg` #191E1A | 8.5 | `span.neg` |
| dark | `--ch-gain` #7CC79B | `--ch-well-bg-flat` #141815 | 9.0 | `button.btn-s` |
| dark | `--ch-loss` #E7AE57 | `--ch-well-bg-flat` #141815 | 9.0 | `span.v.lo` |
| dark | `--ch-text-secondary` #D0C9B8 | `--ch-flat-tint` #232825 | 9.1 | `span.nx` |
| dark | `--ch-gain` #7CC79B | `--ch-grouped-bg` #0E120F | 9.4 | `svg` |
| dark | `#47443D` | `#FFFEFB` | 9.6 | `span` |
| dark | `--ch-text-secondary` #D0C9B8 | `--ch-card-bg` #191E1A | 10.2 | `div.field` |
| dark | `#1C1B18` | `--ch-champagne` #D8C79B | 10.3 | `span.badge` |
| dark | `#1C1B18` | `#CAC9C1` | 10.4 | `div.top` |
| dark | `--ch-feature-ink` #F4F1E8 | `--ch-feature-bg` #123D29 | 10.8 | `div.t` |
| dark | `--ch-feature-bg` #123D29 | `--ch-feature-ink` #F4F1E8 | 10.8 | `button.btn-p` |
| dark | `--ch-text-secondary` #D0C9B8 | `#141915` | 10.8 | `svg` |
| dark | `--ch-text-secondary` #D0C9B8 | `--ch-well-bg-flat` #141815 | 10.9 | `button` |
| dark | `--ch-on-frame` #F4EEDD | `#0B3A25` | 11.0 | `span.pp-mark` |
| dark | `--ch-champagne` #D8C79B | `--ch-frame` #08150E | 11.2 | `button.back` |
| dark | `--ch-text-secondary` #D0C9B8 | `--ch-grouped-bg` #0E120F | 11.4 | `span` |
| dark | `#D0CBBA` | `--ch-frame` #08150E | 11.5 | `svg` |
| dark | `--ch-on-frame` #F4EEDD | `#0A331F` | 12.0 | `svg` |
| dark | `sidebar ink 2` #CFD6C8 | `--ch-frame` #08150E | 12.6 | `a` |
| dark | `--ch-text-primary` #F1ECDF | `--ch-flat-tint` #232825 | 12.7 | `i.c` |
| dark | `--ch-on-frame` #F4EEDD | `#202B23` | 12.7 | `a.on` |
| dark | `--ch-text-primary` #F1ECDF | `--ch-card-bg` #191E1A | 14.3 | `span.t.tl` |
| dark | `#1C1B18` | `#E4EEE7` | 14.5 | `div.gh` |
| dark | `#1C1B18` | `#F1EEE6` | 14.8 | `span.all` |
| dark | `--ch-text-primary` #F1ECDF | `#141915` | 15.1 | `span.tt` |
| dark | `--ch-text-primary` #F1ECDF | `--ch-well-bg-flat` #141815 | 15.2 | `button.qo` |
| dark | `--ch-seg-on-ink` #F6F1E4 | `--ch-well-bg-flat` #141815 | 15.9 | `button` |
| dark | `--ch-on-frame` #F4EEDD | `#0D1611` | 15.9 | `div.tm` |
| dark | `--ch-text-primary` #F1ECDF | `--ch-grouped-bg` #0E120F | 16.0 | `div.who` |
| dark | `--ch-on-frame` #F4EEDD | `--ch-frame` #08150E | 16.1 | `span` |
| dark | `#1C1B18` | `#FFFEFB` | 17.1 | `b` |
