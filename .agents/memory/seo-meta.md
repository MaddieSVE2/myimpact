---
name: SEO meta pattern
description: How per-page SEO metadata is managed in the my-impact artifact using react-helmet-async.
---

## Rule
Use `PageMeta` from `src/components/PageMeta.tsx` for all public pages; use `NoIndexMeta` for private/authenticated pages.

**Why:** The previous approach used manual `useEffect` DOM manipulation (only Methodology.tsx did this). react-helmet-async was installed and HelmetProvider added to `App.tsx` to enable declarative meta tags.

**How to apply:**
- `HelmetProvider` wraps the entire app in `App.tsx`
- `AppRouter` in `App.tsx` holds `NOINDEX_PATH_PREFIXES` — add any new private paths here
- `PrivateRoute.tsx` automatically renders `<NoIndexMeta />` for all PrivateRoute-wrapped pages
- Public pages: import `PageMeta` and render it at the top of the component's return JSX
- Canonical origin: `https://myimpact.uk`
- OG image: `https://myimpact.uk/opengraph.jpg`
- JSON-LD structured data is passed as `jsonLd` prop (single object or array)
