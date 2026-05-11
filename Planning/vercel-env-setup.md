# Vercel Env Setup — NEXT_PUBLIC_KALORI_ENV

Per Task 4.7.7 cheap wins. The Vercel project `kalori` needs `NEXT_PUBLIC_KALORI_ENV` populated in all 3 scopes so Sentry env tagging is correct.

## Commands (run from project root)

```bash
# Production
vercel env add NEXT_PUBLIC_KALORI_ENV production
# When prompted: prod

# Preview (all preview deployments)
vercel env add NEXT_PUBLIC_KALORI_ENV preview
# When prompted: preview

# Development (local dev server)
vercel env add NEXT_PUBLIC_KALORI_ENV development
# When prompted: dev
```

## Verify

```bash
vercel env ls | grep KALORI_ENV
```

Should show 3 lines, one per scope.

## Effect

Sentry env tagging will now correctly distinguish prod / preview / dev events. Until populated, all 3 scopes tag as prod (the default).

## Status

- [x] production scope populated
- [x] preview scope populated
- [x] development scope populated
