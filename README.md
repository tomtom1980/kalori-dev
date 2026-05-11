# Kalori

AI-first calorie & nutrition tracker (PWA, dark-only, single-user).

Stack: Next.js 16 · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui · Supabase · Gemini · Vercel · Sentry.

## Development

```bash
pnpm install
cp .env.example .env.local      # fill from Planning/devapikeys.txt
pnpm dev                        # next dev on :3000
```

Other scripts:

| Command              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `pnpm typecheck`     | `tsc --noEmit`                               |
| `pnpm lint`          | ESLint (incl. I3 no-gemini-leak rule)        |
| `pnpm test`          | Vitest (unit + integration)                  |
| `pnpm test:coverage` | Vitest with V8 coverage report               |
| `pnpm test:e2e`      | Playwright E2E                               |
| `pnpm build`         | Production build (Next.js + Sentry wrapping) |
| `pnpm format:check`  | Prettier check                               |

## Project layout

- `app/` — Next.js App Router
- `components/` — UI primitives (shadcn) + feature components
- `lib/` — server/client utilities (`lib/ai/**` is server-only; enforced by ESLint)
- `eslint-rules/` — custom ESLint rules (`no-gemini-leak` lands here in Task 1.1)
- `tests/` — unit (Vitest), integration (Vitest), e2e (Playwright), rls (Supabase), axe
- `supabase/migrations/` — SQL migrations (landing in Task 1.2)
- `Planning/` — PRD, architecture, design-doc, task tracker (local planning artifacts)

See `CLAUDE.md` for session-start protocol and state-file routing.
