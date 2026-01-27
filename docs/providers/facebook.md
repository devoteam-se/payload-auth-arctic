# Facebook OAuth Setup

This guide walks you through creating Facebook OAuth credentials.

## Step 1: Create a Facebook App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Consumer** or **Business** based on your use case
4. Enter your app name and contact email
5. Click **Create App**

## Step 2: Add Facebook Login

1. From the dashboard, find **Facebook Login** and click **Set Up**
2. Select **Web**
3. Enter your site URL: `http://localhost:3000`
4. Click **Save** → **Continue**

## Step 3: Configure OAuth Settings

1. Go to **Facebook Login** → **Settings**
2. Add **Valid OAuth Redirect URIs**:
  ```
  http://localhost:3000/api/users/oauth/facebook/callback
  https://yourdomain.com/api/users/oauth/facebook/callback
  ```
3. Click **Save Changes**

## Step 4: Get App Credentials

1. Go to **Settings** → **Basic**
2. Copy the **App ID**
3. Click **Show** next to App Secret and copy it

## Step 5: Set App Mode (Production)

1. Toggle the app from **Development** to **Live** mode
2. Complete any required verification steps

> **Note**: In Development mode, only users listed as testers can log in.

## Environment Variables

```env
FACEBOOK_APP_ID=123456789012345
FACEBOOK_APP_SECRET=your-app-secret
```

## Plugin Configuration

```typescript
import { facebookProvider } from 'payload-auth-sso/providers'

// In your arcticOAuthPlugin config:
providers: [
  facebookProvider({
    clientId: process.env.FACEBOOK_APP_ID!,
    clientSecret: process.env.FACEBOOK_APP_SECRET!,
  }),
]
```

## Additional Options

```typescript
facebookProvider({
  clientId: process.env.FACEBOOK_APP_ID!,
  clientSecret: process.env.FACEBOOK_APP_SECRET!,
  // Request additional scopes
  scopes: ['user_birthday', 'user_location'],
})
```

## Available Scopes

| Scope | Description |
|-------|-------------|
| `email` | User's email address (default) |
| `public_profile` | Name, picture, etc. (default) |
| `user_birthday` | User's birthday |
| `user_friends` | List of friends using the app |
| `user_location` | User's location |

See [Facebook Permissions Reference](https://developers.facebook.com/docs/permissions) for the complete list. Note that advanced permissions require App Review.

## Troubleshooting

### "App Not Set Up" Error

- Ensure the app is in **Live** mode for production use
- In Development mode, add test users in **Roles** → **Test Users**

### "URL Blocked" Error

- Verify the redirect URI is added to **Valid OAuth Redirect URIs**
- Check that your domain is added in **Settings** → **Basic** → **App Domains**

### "Invalid App ID"

- Ensure you're using the App ID, not the App Secret
- Verify the App ID matches what's shown in **Settings** → **Basic**
