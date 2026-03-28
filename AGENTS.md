# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a single Next.js 15 application ("Appraisal Comps Maps") for commercial real estate appraisal management. It uses pnpm as the package manager and Turbopack for dev.

### Quick reference

| Task | Command |
|------|---------|
| Dev server | `pnpm dev` (port 3000, uses Turbopack) |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Lint + typecheck | `pnpm check` |
| Format check | `pnpm format:check` |
| Format write | `pnpm format:write` |
| Build | `pnpm build` |

### Environment variables

All required env vars are listed in `.env.example`. The app uses `@t3-oss/env-nextjs` (see `src/env.js`) for runtime validation. Required client-side variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
- `NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL`

Set `SKIP_ENV_VALIDATION=true` to bypass env validation during builds if secrets are unavailable.

### Authentication

The app uses Google OAuth via Supabase Auth. The middleware (`src/middleware.ts`) redirects all unauthenticated requests to `/login`. To test authenticated routes, a Google OAuth login through the Desktop pane is required.

### Gotchas

- `pnpm install` may warn about ignored build scripts for `@tailwindcss/oxide`, `sharp`, and `unrs-resolver`. The `pnpm.onlyBuiltDependencies` field in `package.json` allows these to run. Use `pnpm install --force` if native modules weren't built on initial install.
- The `.env` file must be created from environment variables or `.env.example` before running `pnpm dev` or `pnpm build` (unless `SKIP_ENV_VALIDATION=true`).
- Empty string env vars are treated as undefined by the validation schema, so they will fail validation.
