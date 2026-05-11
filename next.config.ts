import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Task 4.1 Phase 3 fix: `pnpm build:analyze` (ANALYZE=true) renders the
// webpack bundle visualizer so future per-route budget regressions get
// caught quickly. Runs only when `ANALYZE=true`; no effect on default
// builds. Per the react-perf review, this closes the Phase 1 §8
// deliverable gap noted during sub-step 3.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // React Compiler (stable v1.0, peer-declared by next@16) auto-memoizes
  // components + hooks. Enabled in response to the Task 2.2 react-perf
  // review — lets Phase 1's "no manual memo" assumption hold without
  // littering components with useCallback/useMemo. Requires the
  // `babel-plugin-react-compiler` devDependency. In next@16 this is a
  // top-level option (moved out of `experimental` with v16).
  reactCompiler: true,
  // NOTE (Task 3.5 M1.6 deviation): `cacheComponents: true` would enable
  // the `'use cache'` directive + `cacheTag` reads, but Next 16 requires
  // every page/route to drop `export const runtime = 'nodejs'` and
  // `export const dynamic = 'force-dynamic'` before the flag can ship.
  // Migrating all 9 routes is out of scope for 3.5 (would touch Tasks 2.1
  // auth, 3.1 storage, 3.2-3.4 AI + entries). Architecture contract §3
  // Path 2 fallback applies: reads go through React `cache()` for
  // per-request dedupe; writes still route through `TAGS.*` so the future
  // cacheComponents migration only has to flip the flag. See
  // Planning/.tmp/task-3.5-output.md § Deviations for full context.
  //
  // Task 4.1 Phase 3 fix (P3-bug-2): whitelist Supabase Storage signed +
  // public thumbnail URLs used by `<LibraryCard>` + FoodDetail next/image.
  // Wildcard hostname is required because kalori-dev
  // (aaiohznsqlqchsoxaqkz.supabase.co) and kalori-prod
  // (dryysypycsexvlbabtwq.supabase.co) project refs differ; the pathname
  // constraints lock access to the `food-thumbnails` bucket so arbitrary
  // Supabase endpoints cannot be proxied. `deviceSizes` + `imageSizes` +
  // AVIF/WebP format negotiation per Phase 1 §16.4 contract.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/sign/food-thumbnails/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/food-thumbnails/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 160, 220, 240, 256],
  },
  turbopack: {
    root: __dirname,
  },
};

// Task 5.1.2: PWA service worker. Next 16 + Turbopack do not yet support the
// `@serwist/next` webpack plugin (https://github.com/serwist/serwist/issues/54),
// so we bundle `app/sw.ts` -> `public/sw.js` via a dedicated esbuild script
// (`scripts/build-sw.mjs`) wired into the npm `build` chain. The SW relies on
// runtime caching only — there is no precache manifest, so no build-time
// `__SW_MANIFEST` injection is needed. See `lib/pwa/sw-runtime-caching.ts`
// for the routing config that forbids caching `/api/*` and `/auth/**`.

const sentryOptions = {
  org: process.env.SENTRY_ORG ?? 'kalori',
  project: process.env.SENTRY_PROJECT ?? 'kalori-dev',
  silent: !process.env.CI,
  // Only upload source maps when SENTRY_AUTH_TOKEN is present (main-branch builds in CI).
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  authToken: process.env.SENTRY_AUTH_TOKEN ?? '',
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), sentryOptions);
