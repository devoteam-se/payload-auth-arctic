# Google OAuth Setup

This guide walks you through creating Google OAuth credentials.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter a project name and click **Create**

## Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Select **External** (or Internal for Google Workspace)
3. Fill in the required fields:
   - **App name**: Your application name
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **Save and Continue**
5. Add scopes: `email`, `profile`, `openid`
6. Add test users if in testing mode

## Step 3: Create OAuth Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Add **Authorized redirect URIs**:
  ```
  http://localhost:3000/api/users/oauth/google/callback
  https://yourdomain.com/api/users/oauth/google/callback
  ```
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

## Environment Variables

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
```

## Plugin Configuration

```typescript
import { googleProvider } from 'payload-auth-sso/providers'

// In your arcticOAuthPlugin config:
providers: [
  googleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
]
```

## Additional Options

```typescript
googleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  // Request additional scopes
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
})
```

## Troubleshooting

### "Access blocked: This app's request is invalid"

- Verify the redirect URI matches exactly (including trailing slashes)
- Ensure OAuth consent screen is configured

### "Error 400: redirect_uri_mismatch"

- Check that the callback URL is added to **Authorized redirect URIs**
- URLs are case-sensitive and must match exactly
