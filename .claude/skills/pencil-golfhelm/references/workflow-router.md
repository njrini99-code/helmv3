# Design Workflow Router — Which Skill for Which Task

> When a design task comes in, use this router to activate the right skills in the right order.

---

## Decision Tree

```
Design task arrives
│
├── Is it a PENCIL design task? (creating/editing .pen files)
│   ├── YES → Read pencil-golfhelm/SKILL.md FIRST
│   │   ├── Marketing creative? → Also read references/creative-specs.md
│   │   ├── Dashboard mockup? → Also read references/feature-templates.md
│   │   ├── Importing screenshots? → Also read references/screenshot-pipeline.md
│   │   └── Need component IDs? → Also read references/component-map.md
│   │
│   └── Then layer on:
│       ├── design-system/golfhelm/MASTER.md (always)
│       └── design-system/golfhelm/pages/[page].md (if exists)
│
├── Is it a CODE implementation task? (React/Next.js components)
│   ├── New feature UI → premium-ui-systems skill + modern-saas-ui skill
│   ├── Animation/motion → ui-animation skill
│   ├── Accessibility fix → web-accessibility skill
│   ├── Design review → web-design-guidelines skill (linter)
│   └── Product design thinking → revolutionary-product-designer skill
│
├── Is it a CREATIVE DIRECTION task? (deciding style/approach)
│   ├── Need style direction → ui-ux-pro-max (--design-system)
│   ├── Need font pairing → ui-ux-pro-max (--domain typography)
│   ├── Need color exploration → ui-ux-pro-max (--domain color)
│   └── Need landing structure → ui-ux-pro-max (--domain landing)
│
└── Is it a MARKETING ASSET? (IG posts, stories, ads)
    ├── HTML-based render → golfhelm-creative-engine skill
    ├── Pencil-based design → pencil-golfhelm skill
    └── Both? → Design in Pencil first, then export concept to HTML
```

---

## Skill Activation by Task Type

### "Design a new dashboard page"
```
1. Read: pencil-golfhelm/SKILL.md
2. Read: design-system/golfhelm/MASTER.md
3. Read: design-system/golfhelm/pages/dashboard.md
4. Read: references/feature-templates.md (for scaffold recipe)
5. Read: references/component-map.md (for component IDs)
6. Activate: premium-ui-systems (hierarchy methodology)
7. After: web-accessibility audit
```

### "Create an Instagram post for CoachHelm AI"
```
1. Read: pencil-golfhelm/SKILL.md
2. Read: design-system/golfhelm/MASTER.md
3. Read: design-system/golfhelm/pages/instagram-creatives.md
4. Read: references/creative-specs.md
5. Use: Pencil batch_design to create on canvas
6. Use: G() operation for stock/AI backgrounds
7. After: get_screenshot to verify composition
```

### "Build a React component for the player stats card"
```
1. Read: design-system/golfhelm/MASTER.md
2. Activate: premium-ui-systems (component patterns)
3. Activate: modern-saas-ui (bento grids, glass system)
4. Activate: ui-animation (for hover/enter animations)
5. After: web-design-guidelines linter review
6. After: web-accessibility WCAG audit
```

### "Redesign the landing page"
```
1. Read: design-system/golfhelm/MASTER.md
2. Read: design-system/golfhelm/pages/landing.md
3. Activate: revolutionary-product-designer (10x thinking)
4. Run: ui-ux-pro-max --domain landing "SaaS sports hero premium"
5. Activate: premium-ui-systems (section architecture)
6. If Pencil mockup first: Read pencil-golfhelm/SKILL.md
7. After: web-accessibility + web-design-guidelines
```

### "Review the UI quality of [page]"
```
1. Activate: web-design-guidelines (file:line linting)
2. Activate: web-accessibility (WCAG 2.1 audit)
3. Cross-check: design-system/golfhelm/MASTER.md (brand compliance)
4. If deep audit: golfhelm-ui-audit skill (Playwright screenshots)
```

### "Explore a new design direction"
```
1. Activate: revolutionary-product-designer (first principles)
2. Run: ui-ux-pro-max --design-system "relevant keywords"
3. Run: ui-ux-pro-max --domain style "keywords"
4. Run: ui-ux-pro-max --domain typography "keywords"
5. Then: Create in Pencil or implement in code
```

---

## Skill Compatibility Matrix

| Skill | Works with Pencil | Works with Code | Works with Creatives |
|-------|:-:|:-:|:-:|
| pencil-golfhelm | ✅ PRIMARY | ❌ | ✅ |
| golfhelm-creative-engine | ❌ | ✅ HTML render | ✅ PRIMARY |
| premium-ui-systems | ❌ | ✅ PRIMARY | ❌ |
| modern-saas-ui | ❌ | ✅ | ❌ |
| revolutionary-product-designer | 🟡 Conceptual | ✅ | 🟡 Conceptual |
| ui-ux-pro-max | 🟡 Direction | ✅ | 🟡 Direction |
| ui-animation | ❌ | ✅ PRIMARY | ❌ |
| web-accessibility | ❌ | ✅ PRIMARY | ❌ |
| web-design-guidelines | ❌ | ✅ PRIMARY | ❌ |
| golfhelm-ui-audit | ❌ | ✅ Audit | ❌ |

---

## Quick Commands

```bash
# Design system search
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "SaaS golf dashboard premium" --design-system

# Style exploration
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "glassmorphism warm premium" --domain style

# Font alternatives
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "premium modern clean" --domain typography

# Chart recommendations
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "performance analytics trend" --domain chart

# UX patterns
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "dashboard loading skeleton animation" --domain ux

# Next.js stack patterns
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "server component data fetching" --stack nextjs
```
