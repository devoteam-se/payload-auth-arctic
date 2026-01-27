# OAuth Provider Setup Guide

This guide walks you through configuring OAuth providers for your Payload CMS application.

## Available Providers

- [Google](providers/google.md)
- [GitHub](providers/github.md)
- [Microsoft Entra ID](providers/entra.md)
- [Facebook](providers/facebook.md)
- [Apple](providers/apple.md)

---

## Environment Variables

Create a `.env` file in your project root with the credentials for your enabled providers:

```env
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Microsoft Entra ID
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TENANT_ID=

# Facebook OAuth
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

# Apple Sign In
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

---

## Plugin Configuration

Configure the plugin in your `payload.config.ts`:

```typescript
import { buildConfig } from 'payload'
import { arcticOAuthPlugin } from 'payload-auth-sso'
import {
  googleProvider,
  githubProvider,
  entraProvider,
  facebookProvider,
  appleProvider,
} from 'payload-auth-sso/providers'

export default buildConfig({
  // ... your config
  plugins: [
    arcticOAuthPlugin({
      providers: [
        googleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        githubProvider({
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        }),
        entraProvider({
          clientId: process.env.ENTRA_CLIENT_ID!,
          clientSecret: process.env.ENTRA_CLIENT_SECRET!,
          tenantId: process.env.ENTRA_TENANT_ID!,
        }),
        facebookProvider({
          clientId: process.env.FACEBOOK_APP_ID!,
          clientSecret: process.env.FACEBOOK_APP_SECRET!,
        }),
        appleProvider({
          clientId: process.env.APPLE_CLIENT_ID!,
          teamId: process.env.APPLE_TEAM_ID!,
          keyId: process.env.APPLE_KEY_ID!,
          privateKey: process.env.APPLE_PRIVATE_KEY!,
        }),
      ],
    }),
  ],
})
```

---

## Callback URLs Reference

| Provider | Callback URL |
|----------|-------------|
| Google | `/api/users/oauth/google/callback` |
| GitHub | `/api/users/oauth/github/callback` |
| Entra | `/api/users/oauth/entra/callback` |
| Facebook | `/api/users/oauth/facebook/callback` |
| Apple | `/api/users/oauth/apple/callback` |

For local development, use `http://localhost:3000` as the base URL.
For production, replace with your actual domain.

---

## Troubleshooting

### "redirect_uri_mismatch" Error

Ensure the callback URL in your provider settings exactly matches:
- Protocol (`http` vs `https`)
- Domain (including `www` if used)
- Port (`:3000` for local development)
- Path (`/api/users/oauth/{provider}/callback`)

### "invalid_client" Error

- Double-check your Client ID and Client Secret
- Ensure there are no extra spaces or newlines
- For Apple, verify the private key format is correct
