# <Page> catalog (<prefix>xxx)

Copy this file to `docs/clubhouse/catalog/<slug>.md` once the page has a page
number in `catalog/README.md` and in `CATALOG_PAGE`
(`scripts/clubhouse/check.mjs`). Replace `P` in the numbers below with that
prefix: `P0 01` becomes `8001` for a one-digit page and `09001` for a
two-digit one. Delete any section with no rows. Numbers are never reused, and
a removed row stays in its table with the word retired.

Route `<route>` · code `src/clubhouse/screens/<slug>/`, loader
`src/clubhouse/data/<slug>.ts` · tests `src/clubhouse/__tests__/<slug>.test.tsx` · preview
`/clubhouse-preview/<slug>` (`?state=empty|failed|partial|loading`).

## P0xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-P001 | <What the person did> fails | "Couldn't <verb> the <thing>" + what to do next | `useAction` | <slug>.test › CH-P001 |

## P1xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## P2xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-P201 | <Section> doesn't load | "<Section> didn't load." + Try again | `InlineNotice` | <slug>.test › CH-P201 |
| CH-P202 | <Section> crashes | "<Section> couldn’t be shown." The rest of the page stays | `SectionBoundary` | <slug>.test › CH-P202 |

## P3xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## P4xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-P401 | The page is loading | Its skeleton | `<Page>Skeleton` | <slug>.test › CH-P401 |

## P5xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## P6xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## P7xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |

## P8xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-P801 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
