# payload-auth-arctic

OAuth SSO plugin for [Payload CMS 3.x](https://payloadcms.com) powered by [Arctic](https://arcticjs.dev/).

## Features

- PKCE + state/CSRF protection on all flows
- Microsoft Entra ID with Graph API groups/roles for access control
- `authorizeLogin` hook to gate access by group membership or any custom logic
- `disableLocalStrategy` for SSO-only deployments
- Auto-creates users on first login, links OAuth accounts by email
- UI login buttons injected into the Payload admin panel
- Refreshes SSO data (groups, roles, profile) on every re-login

## Installation

From npm:

```bash
npm install payload-auth-arctic
```

Or install directly from GitHub:

```bash
npm install git+ssh://git@github.com:devoteam-se/payload-auth-arctic.git

# Pin to a specific tag
npm install git+ssh://git@github.com:devoteam-se/payload-auth-arctic.git#v1.0.0
```

The package builds automatically on install via the `prepare` script.

## Quick Start

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { arcticOAuthPlugin, entraProvider } from 'payload-auth-arctic'

export default buildConfig({
  // ...
  plugins: [
    arcticOAuthPlugin({
      providers: [
        entraProvider({
          clientId: process.env.ENTRA_CLIENT_ID!,
          clientSecret: process.env.ENTRA_CLIENT_SECRET!,
          tenantId: process.env.ENTRA_TENANT_ID!,
        }),
      ],
    }),
  ],
})
```

## Entra ID Configuration

```ts
entraProvider({
  clientId: process.env.ENTRA_CLIENT_ID!,
  clientSecret: process.env.ENTRA_CLIENT_SECRET!,
  tenantId: process.env.ENTRA_TENANT_ID!,

  // Fetch groups and roles from Microsoft Graph (optional)
  graph: {
    profile: true,  // Store full /me profile in ssoProfile field
    groups: true,    // Fetch group memberships → ssoGroups field
    roles: true,     // Fetch directory roles → ssoRoles field
  },

  // Entra login prompt behavior (default: 'select_account')
  prompt: 'select_account',

  // Additional scopes beyond the defaults
  scopes: [],
})
```

When `graph` options are enabled, the required scopes (`GroupMember.Read.All`, `Directory.Read.All`) are added automatically.

**Entra App Registration requirements:**
- Redirect URI: `https://your-domain.com/api/users/oauth/entra/callback`
- API permissions: `openid`, `profile`, `email`, `User.Read` (always required). Add `GroupMember.Read.All` and/or `Directory.Read.All` if using graph features.

## Plugin Options

```ts
arcticOAuthPlugin({
  // Required
  providers: [],

  // User collection slug (default: 'users')
  userCollection: 'users',

  // Auto-create users on first login (default: true)
  autoCreateUsers: true,

  // Redirect URLs
  successRedirect: '/admin',
  failureRedirect: '/admin/login?error=oauth_failed',

  // SSO-only mode — disables email/password login (default: false)
  disableLocalStrategy: false,

  // Enable/disable plugin (default: true)
  enabled: true,

  // Authorization gate — reject login based on user data
  authorizeLogin: async ({ user, userInfo, provider }) => {
    // Return false to deny access
    return true
  },

  // Hook: modify user data before creation
  beforeUserCreate: async ({ userInfo, provider }) => {
    return { email: userInfo.email, name: userInfo.name }
  },

  // Hook: runs after successful login
  afterLogin: async ({ user, userInfo, provider }) => {},

  // Custom field mapping from OAuth profile to Payload user
  mapUserFields: (userInfo, provider) => ({
    email: userInfo.email,
    name: userInfo.name,
  }),
})
```

## Restricting Access by Entra Group

Use `authorizeLogin` with Entra's graph groups to restrict which users can log in:

```ts
arcticOAuthPlugin({
  disableLocalStrategy: true,
  providers: [
    entraProvider({
      clientId: process.env.ENTRA_CLIENT_ID!,
      clientSecret: process.env.ENTRA_CLIENT_SECRET!,
      tenantId: process.env.ENTRA_TENANT_ID!,
      graph: { groups: true },
    }),
  ],
  authorizeLogin: async ({ user }) => {
    const groups = user.ssoGroups as Array<{ id: string }> | undefined
    return groups?.some(g => g.id === process.env.ENTRA_ADMIN_GROUP_ID!) ?? false
  },
})
```

Users not in the specified group will be redirected with `?error=oauth_failed&message=access_denied`.

## User Collection Fields

The plugin adds these fields to your user collection automatically:

| Field | Type | Description |
|-------|------|-------------|
| `oauthAccounts` | array | Linked OAuth accounts (provider, providerId, email, connectedAt) |
| `ssoProfile` | json | Full Graph `/me` profile (when `graph.profile` is enabled) |
| `ssoGroups` | json | Group memberships from Graph (when `graph.groups` is enabled) |
| `ssoRoles` | json | Directory roles from Graph (when `graph.roles` is enabled) |

All fields are read-only in the admin panel sidebar. SSO data is refreshed on every login.

## Session Support (Payload 3.74+)

Payload 3.74.0 introduced `useSessions: true` as the default for auth collections. The built-in JWT strategy rejects tokens that don't contain a valid `sid` (session ID) matching a session stored on the user document.

This plugin handles sessions automatically:

- **Payload 3.74+** (`useSessions: true`): On OAuth login, the plugin creates a session on the user document and includes the `sid` in the JWT. The custom `oauth-jwt` strategy (used when `disableLocalStrategy: true`) validates the session on each request, matching Payload's built-in behavior.
- **Payload < 3.74** (`useSessions` absent): Session logic is skipped entirely. Authentication works with stateless JWTs as before.

No configuration is needed — the plugin detects `useSessions` at runtime.

## Frontend Login

The admin panel login works out of the box. For **custom frontend pages** that need OAuth login with redirect-back support, the package exports a React hook and a plain utility function.

### React Hook

```tsx
'use client'
import { useOAuthProviders } from 'payload-auth-arctic/client'

export default function LoginPage() {
  const { providers, isLoading, login } = useOAuthProviders()

  return (
    <div>
      {providers.map((provider) => (
        <button key={provider.key} onClick={() => login(provider, '/dashboard')}>
          Sign in with {provider.displayName}
        </button>
      ))}
    </div>
  )
}
```

The second argument to `login()` is `returnTo` — the URL to redirect to after OAuth completes. If omitted, the plugin's `successRedirect` (default `/admin`) is used.

If your user collection isn't `'users'`, pass it as an option:

```ts
const { providers, login } = useOAuthProviders({ userCollection: 'members' })
```

### Plain Utility

For server components, vanilla JS, or anywhere you just need the URL:

```ts
import { getOAuthLoginUrl } from 'payload-auth-arctic'
// or from the client entrypoint:
import { getOAuthLoginUrl } from 'payload-auth-arctic/client'

const url = getOAuthLoginUrl('/api/users/oauth/entra', '/dashboard')
// → "/api/users/oauth/entra?returnTo=%2Fdashboard"
```

## How It Works

1. User clicks "Sign in with Microsoft" on the Payload login page
2. Plugin redirects to Entra's authorization URL (with PKCE + state)
3. Entra redirects back to `/api/{collection}/oauth/entra/callback`
4. Plugin exchanges the code for tokens, fetches user info (and Graph data if configured)
5. User is found by OAuth account, matched by email, or auto-created
6. `authorizeLogin` hook runs — rejects if it returns `false`
7. `afterLogin` hook runs
8. A session is created on the user document (Payload 3.74+ only)
9. Payload JWT is generated (with `sid` if sessions are enabled) and set as a cookie
10. User is redirected to `successRedirect`

## Development

```bash
pnpm install
cp dev/.env.example dev/.env  # Configure your Entra credentials
pnpm dev                       # Starts at http://localhost:3000
```

## License

MIT
