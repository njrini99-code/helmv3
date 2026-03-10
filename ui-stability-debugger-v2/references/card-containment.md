# Card Containment & Overflow — Deep Dive

## The Card Containment Checklist

Every card in the app should pass all 7 of these checks:

```
✅ overflow-clip on the card root (content can't escape)
✅ rounded-2xl for consistent corner radius
✅ p-6 (or p-5 for compact) for breathing room
✅ Text has truncate or line-clamp-N
✅ Flex children have min-w-0 (prevent text blowout)
✅ Grid cards have min-h for consistent height
✅ Numbers use tabular-nums for alignment
```

---

## Container Queries for Cards (2025)

Container queries let cards adapt to their available space instead of the viewport. This means a card can be responsive to its column width in a grid — not the screen width.

```tsx
// Card adapts to its container, not the viewport
<div className="@container">
  <div className="overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl p-6">
    {/* Horizontal layout when card has enough space */}
    <div className="flex flex-col @sm:flex-row gap-4">
      <div className="@sm:w-24 @sm:h-24 rounded-lg bg-warm-100" />
      <div className="flex-1 min-w-0">
        <h3 className="truncate font-semibold @lg:text-xl">{title}</h3>
        <p className="line-clamp-2 @lg:line-clamp-4 text-sm text-warm-500">{desc}</p>
      </div>
    </div>
  </div>
</div>
```

---

## The min-w-0 Trick (Critical for Flex Layouts)

By default, flex children have `min-width: auto`, which means text content can push the flex container wider than its parent. Adding `min-w-0` allows text to shrink and truncate properly.

```tsx
// WITHOUT min-w-0: text can blow out the flex container
<div className="flex items-center gap-3">
  <Avatar />
  <div>  {/* ← This div can expand infinitely */}
    <p>{veryLongPlayerName}</p>  {/* Pushes everything wider */}
  </div>
</div>

// WITH min-w-0: text truncates within the flex container
<div className="flex items-center gap-3">
  <Avatar className="shrink-0" />  {/* Avatar never shrinks */}
  <div className="min-w-0 flex-1">  {/* ← Can shrink below content size */}
    <p className="truncate">{veryLongPlayerName}</p>  {/* Truncates properly */}
  </div>
</div>
```

**Where to use min-w-0**: Any flex child that contains text that could be longer than the available space. This includes player names, email addresses, descriptions, stat labels, and any dynamic content.

---

## Responsive Card Grids

```tsx
// Standard responsive grid pattern
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>

// For stat cards (4 across on desktop)
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {stats.map(stat => <StatCard key={stat.label} {...stat} />)}
</div>

// For list items (single column but different on tablet)
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  {players.map(p => <PlayerCard key={p.id} {...p} />)}
</div>
```

---

## overflow-clip vs overflow-hidden

| Feature | `overflow-clip` | `overflow-hidden` |
|---------|:-:|:-:|
| Clips at border-radius | ✅ | ✅ |
| Creates scroll container | ❌ | ✅ |
| Works with backdrop-filter | ✅ | ⚠️ Can conflict |
| Performance | Better | Slightly worse |
| Browser support | All modern | All |
| Scrollable children | ✅ (children can scroll) | ❌ (scroll container conflict) |

**Recommendation**: Always use `overflow-clip` for cards unless you specifically need the card itself to scroll.

---

## Content-Aware Height Constraints

```tsx
// Stat cards: fixed-ish height, content adapts
<div className="min-h-28 max-h-40 overflow-clip rounded-2xl p-6">

// List items: compact but not collapsing
<div className="min-h-16 overflow-clip rounded-xl p-4">

// Feature cards: room for content but bounded
<div className="min-h-[200px] max-h-[320px] overflow-clip rounded-2xl p-6">

// If content could exceed max-h, make it scrollable:
<div className="max-h-[320px] overflow-clip rounded-2xl">
  <div className="p-6 overflow-y-auto max-h-[320px]">
    {/* Scrollable content inside fixed card */}
  </div>
</div>
```
