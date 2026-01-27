# Apple Sign In Setup

This guide walks you through creating Apple Sign In credentials.

> **Note**: Apple Sign In requires an Apple Developer account ($99/year).

## Step 1: Create an App ID

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Go to **Identifiers** → Click **+**
4. Select **App IDs** → **Continue**
5. Select **App** → **Continue**
6. Fill in:
   - **Description**: Your app name
   - **Bundle ID**: `com.yourcompany.yourapp` (Explicit)
7. Under **Capabilities**, enable **Sign In with Apple**
8. Click **Continue** → **Register**

## Step 2: Create a Services ID

1. Go to **Identifiers** → Click **+**
2. Select **Services IDs** → **Continue**
3. Fill in:
   - **Description**: Your app name (Web)
   - **Identifier**: `com.yourcompany.yourapp.web`
4. Click **Continue** → **Register**
5. Click on the newly created Services ID
6. Enable **Sign In with Apple**
7. Click **Configure**:
   - **Primary App ID**: Select the App ID from Step 1
   - **Domains**: `localhost`, `yourdomain.com`
   - **Return URLs**:
     ```
     http://localhost:3000/api/users/oauth/apple/callback
     https://yourdomain.com/api/users/oauth/apple/callback
     ```
8. Click **Save** → **Continue** → **Save**

## Step 3: Create a Key

1. Go to **Keys** → Click **+**
2. Enter a **Key Name**
3. Enable **Sign In with Apple**
4. Click **Configure** → Select your Primary App ID
5. Click **Save** → **Continue** → **Register**
6. **Download the key file** (.p8) - you can only download this once!
7. Note the **Key ID**

## Step 4: Get Team ID

1. Go to [Apple Developer Membership](https://developer.apple.com/account/#!/membership)
2. Copy your **Team ID**

## Environment Variables

```env
APPLE_CLIENT_ID=com.yourcompany.yourapp.web
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----"
```

> **Important**: The private key should include the full PEM format with headers.

### Storing the Private Key

You can store the private key in different ways:

**Option 1: Multi-line in .env**
```env
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg
...
-----END PRIVATE KEY-----"
```

**Option 2: Single line with \n**
```env
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGTAgEA...\n-----END PRIVATE KEY-----"
```

**Option 3: Base64 encoded**
```env
APPLE_PRIVATE_KEY_BASE64=LS0tLS1CRUdJTi...
```
Then decode in your config:
```typescript
privateKey: Buffer.from(process.env.APPLE_PRIVATE_KEY_BASE64!, 'base64').toString('utf-8')
```

## Plugin Configuration

```typescript
import { appleProvider } from 'payload-auth-sso/providers'

// In your arcticOAuthPlugin config:
providers: [
  appleProvider({
    clientId: process.env.APPLE_CLIENT_ID!,
    teamId: process.env.APPLE_TEAM_ID!,
    keyId: process.env.APPLE_KEY_ID!,
    privateKey: process.env.APPLE_PRIVATE_KEY!,
  }),
]
```

## Important Notes

### User Name Only on First Auth

Apple only sends the user's name (first and last) on the **first** authorization. After that, Apple will not include the name in subsequent logins. Make sure to store the name when you first receive it.

### Private Email Relay

Users can choose to hide their email using Apple's Private Email Relay. In this case, you'll receive an email like `xyz123@privaterelay.appleid.com`. Emails sent to this address will be forwarded to the user's real email.

### Services ID vs App ID

- **App ID**: Used for native iOS/macOS apps
- **Services ID**: Used for web authentication (this is what you use as `clientId`)

## Troubleshooting

### "invalid_request" Error

- Verify you're using the **Services ID** (not App ID) as `clientId`
- Check that the domain and return URL are correctly configured
- Ensure the private key includes the full PEM headers

### "invalid_client" Error

- Verify Team ID and Key ID are correct
- Check that the private key is properly formatted
- Ensure the key is associated with the correct App ID

### User Name is Missing

- Apple only provides the name on the first authorization
- If you need the name again, the user must revoke access and re-authorize:
  - Go to **Settings** → **Apple ID** → **Password & Security** → **Apps Using Apple ID**
  - Remove your app
  - Sign in again
