Project slug: kalori

Kalori is an AI-first calorie and nutrition tracker PWA: Next.js 16, React 19, TypeScript, Supabase SSR/client auth and data, Gemini-powered text/photo nutrition parsing, Radix UI primitives, Framer Motion, Zustand, Sentry, Serwist PWA/offline support, and Tailwind v4 tooling. Package manager is pnpm 10.29.3 with Node >=20.19.0.

Testing uses Vitest for unit/integration (`pnpm test`, `pnpm test:unit`, coverage via v8), Playwright for E2E/a11y (`pnpm test:e2e`, `pnpm test:a11y`), plus ESLint, TypeScript typecheck, Lighthouse CI, bundle-budget, and schema-drift scripts. The implementation plan mandates TDD and Playwright for UI behavior.

Recent commits indicate active stabilization and polish around dashboard data views, library logging, meal buttons, entry calorie display, pagination, and UI affordances. Current bugfix batch should focus on regressions in dashboard data-table modal behavior, duplicate-food confirmation UX, library serving defaults, daily/progress editor notes, and image upload/camera recognition flows.
