# LINE OAuth Setup

This guide walks you through creating LINE Login credentials.

## Step 1: Create a LINE Login Channel

1. Go to [LINE Developers Console](https://developers.line.biz/console/)
2. Log in with your LINE account (or create one)
3. Create a **Provider** if you don't have one:
   - Click **Create** under Providers
   - Enter a provider name
4. Under your provider, click **Create a LINE Login channel**
5. Fill in the details:
   - **Channel name**: Your app name
   - **Channel description**: Brief description
   - **App type**: Select **Web app**
   - **Email address**: Your contact email
6. Click **Create**

## Step 2: Configure Callback URL

1. In your channel settings, go to the **LINE Login** tab
2. Under **Callback URL**, click **Edit**
3. Add your callback URL:
   ```
   http://localhost:3000/api/users/oauth/line/callback
   ```
4. Click **Update**

## Step 3: Get Credentials

1. Go to the **Basic settings** tab
2. Copy the **Channel ID** (this is your Client ID)
3. Copy the **Channel secret**

## Step 4: Request Email Permission (Optional)

To access users' email addresses:

1. In the **Basic settings** tab, find **OpenID Connect**
2. Under **Email address permission**, click **Apply**
3. Agree to the terms
4. Upload a screenshot showing how you'll use the email
5. Wait for approval

## Environment Variables

```env
LINE_CLIENT_ID=1234567890
LINE_CLIENT_SECRET=your-channel-secret
```

## Plugin Configuration

```typescript
import { lineProvider } from 'payload-auth-sso/providers'

// In your arcticOAuthPlugin config:
providers: [
  lineProvider({
    clientId: process.env.LINE_CLIENT_ID!,
    clientSecret: process.env.LINE_CLIENT_SECRET!,
  }),
]
```

## Additional Options

```typescript
lineProvider({
  clientId: process.env.LINE_CLIENT_ID!,
  clientSecret: process.env.LINE_CLIENT_SECRET!,
  // Additional scopes are rarely needed for LINE
})
```

## Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | Required for ID token (default) |
| `profile` | Access display name and picture (default) |
| `email` | Access email address (default, requires approval) |

See [LINE Login Scopes](https://developers.line.biz/en/docs/line-login/integrate-line-login/#scopes) for more information.

> **Note**: The `email` scope requires prior approval from LINE. See Step 4 above.

## User Info Returned

LINE Login uses OpenID Connect. User info is extracted from the ID token:

| Field | Description |
|-------|-------------|
| `providerId` | LINE user ID (sub claim) |
| `email` | User's email (if approved and granted) |
| `name` | User's display name |
| `avatarUrl` | User's profile picture URL |

## Channel Status

LINE channels have two statuses:

- **Developing**: Only channel administrators can log in
- **Published**: All LINE users can log in

To publish your channel:

1. Go to your channel in the LINE Developers Console
2. Ensure all required fields are filled
3. Click **Publish** (or the status toggle)

## Auto Login

LINE Login supports auto login when users access your site from:

- LINE's in-app browser
- An external browser previously used for LINE Login

This provides a seamless login experience without showing the login screen.

## Troubleshooting

### "Invalid redirect_uri"

- Ensure the callback URL exactly matches what's registered
- LINE is case-sensitive - check capitalization
- Multiple callback URLs can be added (one per line)

### "Email Not Returned"

- Email permission requires LINE's approval
- The user may have denied email access
- Check that your email permission application was approved

### "Channel Not Found"

- Verify the Channel ID is correct
- Ensure the channel status is "Published" for public access
- Check that you're using the LINE Login channel, not a Messaging API channel

### "Invalid ID Token"

- Ensure the `openid` scope is included (default in this provider)
- Check that your server time is synchronized (JWT validation is time-sensitive)
- Verify the channel secret is correct
