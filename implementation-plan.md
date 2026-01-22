# SSO Plugin MVP Implementation Plan

Build a minimal viable SSO plugin for PayloadCMS 3.x with Microsoft Entra ID to validate viability early.

## Overview

**Goal:** Get a working "Sign in with Microsoft" flow as fast as possible to test viability

**Approach:** 3 phases, each independently testable

---

## Phase 1: Authorization Redirect

Get a working redirect to Microsoft Entra's authorization endpoint with PKCE.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/types.ts` | Create | Plugin config types (EntraConfig, SSOPluginConfig) |
| `src/lib/pkce.ts` | Create | PKCE utilities (generateCodeVerifier, generateCodeChallenge, generateState) |
| `src/index.ts` | Modify | Replace skeleton with SSO plugin, add `/sso/authorize` endpoint |

### Implementation Details

**`src/types.ts`** - Minimal types:
```typescript
export interface EntraConfig {
  tenantId: string
  clientId: string
  clientSecret: string
}

export interface SSOPluginConfig {
  enabled?: boolean
  entra: EntraConfig
  successRedirect?: string  // default: '/admin'
}
```

**`src/lib/pkce.ts`** - Crypto utilities:
- `generateCodeVerifier()` - Random 64-char base64url string
- `generateCodeChallenge(verifier)` - SHA256 hash as base64url
- `generateState()` - Random 32-char hex string

**`src/index.ts`** - Authorize endpoint:
- GET `/api/users/sso/authorize`
- Generate PKCE pair and state
- Store verifier in HTTP-only cookie `sso_pkce`
- Redirect to `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`

### Test Phase 1

1. Add env vars to `dev/.env`:
   ```
   ENTRA_TENANT_ID=xxx
   ENTRA_CLIENT_ID=xxx
   ENTRA_CLIENT_SECRET=xxx
   ```
2. Update `dev/payload.config.ts` plugin config
3. Run `pnpm dev`
4. Navigate to `http://localhost:3000/api/users/sso/authorize`
5. Verify redirect to Microsoft login
6. After login, expect 404 at callback (Phase 2 not built yet)

---

## Phase 2: Callback and User Provisioning

Complete the OAuth flow: exchange code for tokens, find/create user, establish session.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/tokens.ts` | Create | Token exchange and ID token decoding |
| `src/fields/sso-identity.ts` | Create | SSO fields for user collection |
| `src/index.ts` | Modify | Add callback endpoint, modify users collection |

### Implementation Details

**`src/lib/tokens.ts`**:
- `exchangeCodeForTokens({ code, redirectUri, codeVerifier, config })` - POST to token endpoint
- `decodeIdToken(idToken)` - Base64 decode JWT payload (skip signature validation for MVP)

**`src/fields/sso-identity.ts`**:
```typescript
export const ssoIdentityFields: Field[] = [
  { name: 'ssoProvider', type: 'text', admin: { readOnly: true } },
  { name: 'ssoSubjectId', type: 'text', admin: { readOnly: true }, index: true },
]
```

**`src/index.ts`** - Callback endpoint:
- GET `/api/users/sso/callback`
- Validate state, retrieve verifier from cookie
- Exchange code for tokens
- Decode ID token for email, name, sub
- Find user by email OR ssoSubjectId
- Create user if not found (JIT provisioning)
- Generate Payload JWT: `payload.auth.generateToken()`
- Set `payload-token` cookie
- Redirect to `/admin`

### Test Phase 2

1. Complete the full flow from Phase 1
2. After Microsoft login, verify redirect to `/admin` (logged in)
3. Check Users collection - user should exist with `ssoProvider` and `ssoSubjectId`
4. Test with existing user (same email) - should link, not duplicate

---

## Phase 3: Login Button UI

Add "Sign in with Microsoft" button to admin login page.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/AfterLogin.tsx` | Create | SSO button component |
| `src/exports/client.ts` | Modify | Export AfterLogin |
| `src/index.ts` | Modify | Register `afterLogin` admin component |

### Implementation Details

**`src/components/AfterLogin.tsx`**:
```tsx
'use client'
export const AfterLogin = () => {
  // "or" divider + "Sign in with Microsoft" button
  // onClick: window.location.href = '/api/users/sso/authorize'
}
```

**`src/index.ts`** - Register component:
```typescript
config.admin.components.afterLogin = [
  ...(config.admin?.components?.afterLogin || []),
  'payload-auth-sso/client#AfterLogin',
]
```

### Test Phase 3

1. Navigate to `http://localhost:3000/admin/login`
2. Verify button appears below login form with "or" divider
3. Click button, complete Microsoft login
4. Verify redirect to dashboard, logged in

---

## Files Summary

```
src/
├── index.ts              # Main plugin (modify)
├── types.ts              # Config types (create)
├── lib/
│   ├── pkce.ts           # PKCE utilities (create)
│   └── tokens.ts         # Token exchange (create)
├── fields/
│   └── sso-identity.ts   # User SSO fields (create)
├── components/
│   └── AfterLogin.tsx    # Login button (create)
└── exports/
    └── client.ts         # Export AfterLogin (modify)
```

---

## Azure App Registration Setup

1. Azure Portal > Microsoft Entra ID > App registrations > New
2. Name: "PayloadCMS Dev"
3. Supported accounts: Single tenant
4. Redirect URI: `http://localhost:3000/api/users/sso/callback`
5. Create client secret (Certificates & secrets)
6. Note: Application (client) ID, Directory (tenant) ID, Client secret value

---

## Deferred (Not MVP)

- JWT signature validation with JWKS
- Group claims and role mapping
- Graph API for group overage
- Multiple providers
- Token refresh
- Comprehensive error handling
- beforeUserCreate/afterSSOLogin hooks

---

## Verification Checklist

- [ ] Phase 1: `/api/users/sso/authorize` redirects to Microsoft
- [ ] Phase 2: Callback creates/finds user and sets session cookie
- [ ] Phase 3: Login page shows "Sign in with Microsoft" button
- [ ] End-to-end: Click button > Microsoft login > Payload admin dashboard (logged in)
