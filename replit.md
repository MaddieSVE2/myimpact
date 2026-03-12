# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Hosts the **My Impact** web application — a personal social value calculator aimed at younger users (16-35), powered by Social Value Engine proxy library data.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + framer-motion + recharts

## My Impact App

A 3-step wizard that calculates a user's personal social value in GBP:

1. **Actions** — freetext description of what you do for others
2. **Activities** — select from Social Value Engine proxy library (20+ activities across 5 categories)
3. **Contributions** — donations (£) and additional volunteering hours

**Results page** shows:
- Total social value and 4 breakdown metrics (Impact, Contribution, Donations, Personal Development)
- Donut charts by activity and by SDG (Sustainable Development Goal)
- Plain-English accordion explanations of each metric
- Save to history and get activity suggestions

**Additional pages**:
- `/history` — progress tracker showing impact over time
- `/suggestions` — personalised activity ideas to boost impact

### Calculation logic (`artifacts/api-server/src/lib/impactData.ts`)

- **Impact value**: activity quantity × Social Value Engine proxy value per unit
- **Contribution value**: total hours × £12.21 (National Living Wage)
- **Donations value**: direct monetary amount
- **Personal Development value**: based on hours²  × rate (skill gain formula)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   │   └── src/
│   │       ├── lib/impactData.ts    # SVE proxy library + calculation engine
│   │       └── routes/impact.ts    # Impact API routes
│   └── my-impact/          # React + Vite frontend
│       └── src/
│           ├── pages/
│           │   ├── Intro.tsx
│           │   ├── Results.tsx
│           │   ├── History.tsx
│           │   ├── Suggestions.tsx
│           │   └── wizard/
│           │       ├── ActionsStep.tsx
│           │       ├── ActivitiesStep.tsx
│           │       └── ContributionsStep.tsx
│           ├── components/
│           │   ├── layout/Navbar.tsx
│           │   └── wizard/StepProgress.tsx
│           └── lib/wizard-context.tsx  # Shared wizard state
├── lib/
│   ├── api-spec/openapi.yaml    # API contract
│   ├── api-client-react/        # Generated React Query hooks
│   ├── api-zod/                 # Generated Zod schemas
│   └── db/
│       └── src/schema/impact.ts  # impact_records table
└── scripts/
```

## API Endpoints

- `GET /api/impact/activities` — list of 20+ SVE activities with proxy metadata
- `POST /api/impact/calculate` — calculate social value from activities + donations
- `POST /api/impact/suggestions` — get recommended activities based on current activities
- `POST /api/impact/save` — save impact record to database
- `GET /api/impact/history?userId=xxx` — retrieve historical records
- `GET /api/impact/org-stats` — aggregate stats for org portal
- `POST /api/sidekick/chat` — streaming AI chat endpoint (SSE), uses OpenAI via Replit AI Integrations

## Sidekick AI

A collapsible right-side panel (SVE-style) providing contextual AI assistance:
- Powered by OpenAI via Replit AI Integrations (`lib/integrations-openai-ai-server`)
- Collapses to 48px strip with vertical "SIDEKICK" label; expands to 380px chat panel
- Context-aware: passes user's current impact score, activities, and SDGs to the AI
- System prompt: social value expert, warm/encouraging tone for 14-25 age group
- Component: `artifacts/my-impact/src/components/Sidekick.tsx`
- Route: `artifacts/api-server/src/routes/sidekick.ts`

## TypeScript & Composite Projects

- **Always typecheck from the root** — run `pnpm run typecheck`
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push schema changes to database
