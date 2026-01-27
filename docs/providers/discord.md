# Discord OAuth Setup

This guide walks you through creating Discord OAuth credentials.

## Step 1: Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Enter an application name and click **Create**

## Step 2: Configure OAuth2

1. Go to **OAuth2** → **General** in the left sidebar
2. Under **Redirects**, click **Add Redirect**
3. Enter your callback URL:
   ```
   http://localhost:3000/api/users/oauth/discord/callback
   ```
4. Click **Save Changes**

## Step 3: Get Credentials

1. In the **OAuth2** → **General** section:
   - Copy the **Client ID**
   - Click **Reset Secret** to generate a new secret, then copy it

> **Warning**: The client secret is only shown once. Store it securely.

## Environment Variables

```env
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=your-client-secret
```

## Plugin Configuration

```typescript
import { discordProvider } from 'payload-auth-sso/providers'

// In your arcticOAuthPlugin config:
providers: [
  discordProvider({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  }),
]
```

## Additional Options

```typescript
discordProvider({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  // Request additional scopes
  scopes: ['guilds', 'connections'],
})
```

## Available Scopes

| Scope | Description |
|-------|-------------|
| `identify` | Access username, avatar, and discriminator (default) |
| `email` | Access user's email address (default) |
| `guilds` | Access list of guilds the user is in |
| `guilds.join` | Join users to a guild (requires bot in guild) |
| `guilds.members.read` | Read member info in user's guilds |
| `connections` | Access linked third-party accounts |
| `role_connections.write` | Update user's role connection metadata |

See [Discord OAuth2 Scopes](https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes) for the complete list.

> **Note**: Some scopes require Discord approval before use.

## User Info Returned

The Discord provider returns:

| Field | Description |
|-------|-------------|
| `providerId` | Discord user ID |
| `email` | User's email (if `email` scope granted) |
| `name` | Display name (global_name or username#discriminator) |
| `avatarUrl` | User's avatar URL (if set) |

## Troubleshooting

### "Invalid OAuth2 redirect_uri"

- Ensure the redirect URI exactly matches what's registered in the Developer Portal
- Check for trailing slashes - Discord is strict about exact matches
- The URI must be URL-encoded in the authorization request

### "Unknown Application"

- Verify the Client ID is correct
- Ensure the application exists in your Developer Portal

### "Invalid client_secret"

- Reset the client secret in the Developer Portal
- Update your environment variable with the new secret
- Make sure there are no extra spaces in the value

### No Avatar Returned

- Users without a custom avatar will have `avatarUrl` as `undefined`
- Discord's default avatars are generated client-side based on user ID
