# cadeler-auth-plugin

Microsoft Entra ID SSO plugin for [Payload CMS 3.x](https://payloadcms.com) via [Arctic](https://arcticjs.dev/).

## Features

- PKCE + state/CSRF protection on all flows
- Microsoft Entra ID with Graph API groups/roles for access control
- `authorizeLogin` hook to gate access by group membership or any custom logic
- `disableLocalStrategy` for SSO-only deployments
- Auto-creates users on first login, links OAuth accounts by email
- UI login buttons injected into the Payload admin panel
- Refreshes SSO data (groups, roles, profile) on every re-login

## Installation

Install from your GitHub org:

```bash
# SSH
npm install git+ssh://git@github.com:YOUR_ORG/cadeler-auth-plugin.git

# HTTPS
npm install git+https://github.com/YOUR_ORG/cadeler-auth-plugin.git

# Pin to a tag
npm install git+ssh://git@github.com:YOUR_ORG/cadeler-auth-plugin.git#v1.0.0
```

The package builds automatically on install via the `prepare` script.

## Quick Start

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { arcticOAuthPlugin, entraProvider } from 'cadeler-auth-plugin'

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

## How It Works

1. User clicks "Sign in with Microsoft" on the Payload login page
2. Plugin redirects to Entra's authorization URL (with PKCE + state)
3. Entra redirects back to `/api/{collection}/oauth/entra/callback`
4. Plugin exchanges the code for tokens, fetches user info (and Graph data if configured)
5. User is found by OAuth account, matched by email, or auto-created
6. `authorizeLogin` hook runs — rejects if it returns `false`
7. `afterLogin` hook runs
8. Payload JWT is generated and set as a cookie
9. User is redirected to `successRedirect`

## Development

```bash
pnpm install
cp dev/.env.example dev/.env  # Configure your Entra credentials
pnpm dev                       # Starts at http://localhost:3000
```

## License

MIT
