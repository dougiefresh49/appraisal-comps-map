# Agent Authentication Options

How to handle Google OAuth authentication when AI agents need to test the webapp.

## Local Agents (Cursor IDE)

### Option 1: Pre-authenticate (recommended)

1. Open the Cursor IDE browser
2. Navigate to `http://localhost:3000`
3. Log in with your Google account
4. Start the agent — it inherits the authenticated browser session

The agent never needs credentials. The Supabase session cookie persists in the browser.

### Option 2: Agent asks for manual login

If the agent encounters a login screen mid-run, it stops and asks the user to complete Google OAuth. Add this to the agent prompt:

> "If you encounter a login screen or auth redirect, stop and ask me to complete the Google OAuth login in the browser before continuing."

Google's consent screen has bot detection (CAPTCHAs, device verification) so the agent cannot complete OAuth on its own.

---

## Cloud / Background Agents

Cloud agents run in isolated environments with no access to `localhost`. Pre-authentication is not possible.

### For code-only tasks (no browser testing needed)

Most fixes (CSS, text, components, types) don't require browser testing. Use this prompt addition:

> "Do not test in the browser. Verify your changes compile correctly by running `pnpm build`. Fix any type or lint errors before finishing."

### Option 1: Dev-only auth bypass route

Create a dev-only API route using Supabase admin to generate a session without Google OAuth:

```typescript
// src/app/api/dev/auth/route.ts
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not available' }, { status: 404 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'dev-test@yourproject.com',
  });

  return Response.json({ data, error });
}
```

Prerequisites:
- Create a test user in Supabase (email/password, not Google OAuth)
- Only enable on preview/dev deployments, never production
- Agent hits the endpoint, gets a session, continues testing

### Option 2: Service role token in headers

Create middleware that accepts a `x-dev-token` header matching `SUPABASE_SECRET_KEY` and auto-authenticates as a specific user. The cloud agent passes the token in its requests.

---

## When to use what

| Scenario | Approach |
|---|---|
| Local agent, needs browser | Pre-authenticate in Cursor browser |
| Local agent, code-only fix | Skip browser, run `pnpm build` |
| Cloud agent, code-only fix | Skip browser, run `pnpm build` |
| Cloud agent, needs browser | Dev auth bypass + Vercel preview |
