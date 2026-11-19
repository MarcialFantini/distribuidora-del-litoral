# AGENTS.md

Guide for coding agents working on this project.

## What this is

A static Astro portfolio demo: one central stock feeding three fictional sales channels for a fictional distributor ("Distribuidora del Litoral"). Everything runs in the browser. No backend, no external APIs, no real brands. A visible "Demo" mark must always be on screen.

## Commands

- `pnpm dev` / `pnpm preview` run on port **4631**.
- `pnpm build` must pass after every change; `pnpm check` must report 0 errors, 0 warnings, 0 hints.
- `pnpm test:e2e` (preview running) is the acceptance audit: zero console errors/warnings on every view at desktop, 390 px and reduced motion, no horizontal overflow, showcase isolated from the saved session.
- `pnpm poster` (preview running) rewrites `public/poster.jpg` from the real page.

## Layout

- `src/data/` deterministic seeded data: `rng.ts`, `catalog.ts` (300 products), `channels.ts`, `history.ts` (800 October orders). Never commit generated datasets.
- `src/lib/` pure, framework-free logic: stock rules (`stock.ts`), formatting, charts, shipping label SVG, reports, product history. Safe to use at build time.
- `src/scripts/store.ts` single source of truth (state, actions, pub/sub, localStorage persistence). All mutations go through its actions.
- `src/scripts/sim.ts` the one simulation engine. Views never generate events themselves.
- `src/scripts/app.ts` bootstraps once per session (survives view transitions) and mounts a view module per page from `src/scripts/views/`.
- `src/scripts/scenes/` home scenes; below-the-fold ones are imported lazily when they approach the viewport.
- `src/scripts/shell/` persistent chrome: sim controls, keyboard shortcuts, command palette, notifications, toasts.
- `src/pages/` one page per route; the shell uses `transition:persist`.

## Rules

- UI copy in neutral professional Spanish; identifiers and comments in English.
- Animate only `transform` and `opacity` (plus SVG). Respect `.reduced` (set from `prefers-reduced-motion`): static, complete, simulation paused.
- Each view registers listeners through its `Scope` so they are disposed on navigation.
- `?showcase` calls `freezePersistence()` and boots a clean seeded state; never write to localStorage from it.
- Keep the hero headline static (LCP). Keep GSAP out of the critical path (`src/scripts/plugins.ts` is imported dynamically).
- At 390 px tables become cards (`.table--cards`, `.table--products`, `.table--orders`); never add sideways-scrolling tables.
- Every interactive chart element must be keyboard reachable or have an equivalent table.
