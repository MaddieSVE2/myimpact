# SEO Strategy

## In scope
- Public marketing pages
- Public informational pages such as About, Methodology, What's New, Contact, and organisation demo content
- Public shareable pages intended for external audiences, including public profiles and organisation-facing demo/register surfaces
- Public-facing personal and organisation pitch decks at `/pitch-deck/` and `/pitch-deck-orgs/`, when externally shared; confirm indexation intent before treating these as primary search landing pages

## Out of scope
- Authenticated dashboard and member routes such as `/history`, `/journal`, `/settings`, `/results`, `/wizard/**`, `/org/dashboard`, `/org/settings`, `/org/member/**`, `/admin/**`
- Private or invite-only organisation workflows that require login
- Internal component preview and mockup sandbox

## Target audience
- Individuals aged 16-35 who want to measure, track, and share their social impact
- Organisations such as schools, universities, charities, local authorities, and employers evaluating member impact

## Primary keywords
- social value calculator
- volunteering impact calculator
- measure social impact
- social value of volunteering
- organisation impact dashboard

## Notes
- The main app is a React + Vite SPA with a post-build prerender step for a limited set of public routes and request-time rendering for dynamic profile and organisation share URLs.
- Public routes outside the prerender list need special scrutiny because social bots and AI crawlers only see the initial HTML.
- The two separately deployed pitch decks are public Vite slide SPAs; their indexation intent is not explicitly documented.

## Dismissed categories
- None yet
