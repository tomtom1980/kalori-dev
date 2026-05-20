Project slug: kalori

Kalori is an AI-first calorie/nutrition tracker PWA built with Next.js 16, React 19, TypeScript, Supabase SSR/client auth and data, Gemini-powered food/photo parsing, Radix UI primitives, Framer Motion, Zustand, Sentry, Serwist offline/PWA support, and Tailwind v4 tooling. Package scripts cover dev/build, service-worker build, lint, typecheck, Vitest, Playwright, Lighthouse CI, bundle budget, and schema drift.

Recent history: `53f8575` fixed the prior dashboard-food bundle: dashboard modal data tables, in-app duplicate logging confirmation, library default servings, daily/progress editor notes, and camera/upload split for image recognition. The manifest explicitly leaves real-device iOS Safari/Android Chrome camera/upload smoke testing open, and notes native picker prompts were not E2E-automated.

Current follow-up should focus on production photo recognition failure ("Gemini cannot recognize the photo and extract information"), verifying the configured Gemini vision model/API path, and improving the mobile manual-entry fallback for food name, grams, and nutrition fields. Pre-existing dirty files are generated/local artifacts only: `next-env.d.ts`, `public/sw.js`, screenshot PNGs, and `.codex/`.
