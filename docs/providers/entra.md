# Microsoft Entra ID OAuth Setup

This guide walks you through creating Microsoft Entra ID (formerly Azure AD) OAuth credentials.

## Step 1: Register an Application

1. Go to the [Azure Portal](https://portal.azure.com/)
2. Navigate to **Microsoft Entra ID** → **App registrations**
3. Click **New registration**
4. Fill in the details:
   - **Name**: Your application name
   - **Supported account types**: Choose based on your needs:
     - **Single tenant**: Only your organization
     - **Multitenant**: Any Microsoft Entra directory
     - **Multitenant + personal**: Includes personal Microsoft accounts
   - **Redirect URI**: Select **Web** and enter:
     ```
     http://localhost:3000/api/users/oauth/entra/callback
     ```
5. Click **Register**

## Step 2: Configure Authentication

1. Go to **Authentication**
2. Under **Implicit grant and hybrid flows**, enable:
   - ✅ ID tokens
3. Click **Save**

## Step 3: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description and select expiry
4. Click **Add**
5. Copy the **Value** immediately (it won't be shown again)

## Step 4: Get Application Details

From the **Overview** page, copy:
- **Application (client) ID**
- **Directory (tenant) ID**

## Environment Variables

```env
ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_SECRET=your-client-secret
ENTRA_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> **Note**: For multi-tenant apps, use `common` as the tenant ID.

## Plugin Configuration

```typescript
import { entraProvider } from 'payload-auth-sso/providers'

// In your arcticOAuthPlugin config:
providers: [
  entraProvider({
    clientId: process.env.ENTRA_CLIENT_ID!,
    clientSecret: process.env.ENTRA_CLIENT_SECRET!,
    tenantId: process.env.ENTRA_TENANT_ID!,
  }),
]
```

## Additional Options

```typescript
entraProvider({
  clientId: process.env.ENTRA_CLIENT_ID!,
  clientSecret: process.env.ENTRA_CLIENT_SECRET!,
  tenantId: process.env.ENTRA_TENANT_ID!,
  // Request additional scopes
  scopes: ['Mail.Read', 'Calendars.Read'],
})
```

## Tenant ID Options

| Value | Description |
|-------|-------------|
| `{tenant-id}` | Specific tenant (single-tenant apps) |
| `common` | Any Entra ID tenant + personal accounts |
| `organizations` | Any Entra ID tenant (no personal accounts) |
| `consumers` | Personal Microsoft accounts only |

## Troubleshooting

### "AADSTS50011: The reply URL does not match"

- Ensure the redirect URI in Azure matches exactly
- Check for trailing slashes
- Verify the correct protocol (`http` vs `https`)

### "AADSTS7000218: Invalid client secret"

- Client secrets expire - create a new one if expired
- Ensure you copied the secret **Value**, not the Secret ID

### "AADSTS700016: Application not found"

- Verify the Client ID is correct
- Check that the app is registered in the correct tenant
