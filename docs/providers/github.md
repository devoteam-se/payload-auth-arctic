# GitHub OAuth Setup

This guide walks you through creating GitHub OAuth credentials.

## Step 1: Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in the details:
   - **Application name**: Your app name
   - **Homepage URL**: `http://localhost:3000` (or your domain)
   - **Authorization callback URL**:
     ```
     http://localhost:3000/api/users/oauth/github/callback
     ```
4. Click **Register application**

## Step 2: Get Credentials

1. Copy the **Client ID**
2. Click **Generate a new client secret**
3. Copy the **Client Secret** immediately (it won't be shown again)

## Environment Variables

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=your-client-secret
```

## Plugin Configuration

```typescript
import { githubProvider } from 'payload-auth-sso/providers'

// In your arcticOAuthPlugin config:
providers: [
  githubProvider({
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  }),
]
```

## Additional Options

```typescript
githubProvider({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  // Request additional scopes
  scopes: ['read:org', 'repo'],
})
```

## Available Scopes

| Scope | Description |
|-------|-------------|
| `user:email` | Read user email (default) |
| `read:user` | Read user profile data |
| `read:org` | Read organization membership |
| `repo` | Full access to repositories |

See [GitHub OAuth Scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) for the complete list.

## Troubleshooting

### "The redirect_uri is not valid"

- Ensure the callback URL matches exactly what's configured in GitHub
- Only one callback URL can be registered per OAuth App

### "Bad credentials"

- Regenerate the client secret and update your environment variables
- Ensure there are no extra spaces in the credentials
