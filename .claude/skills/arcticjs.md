# Arctic OAuth 2.0 Skill

## Overview

Arctic is a lightweight, fully-typed, runtime-agnostic OAuth 2.0 client library with built-in support for 70+ popular providers. Built on the Fetch API, it supports only the authorization code flow (with and without PKCE) and follows the OAuth 2.0 spec strictly.

**When to use this skill:**
- Implementing OAuth 2.0 authentication for any supported provider
- Building secure login flows with PKCE for mobile/SPA applications
- Creating custom OAuth 2.0 integrations using the generic client
- Working with PayloadCMS, Expo, React Native, or any JavaScript runtime
- Refreshing access tokens or revoking tokens

## Installation

```bash
npm install arctic
```

### Node.js 18 Polyfill

For Node.js 18, polyfill Web Crypto API (not needed in Node.js 20+, Bun, Deno, Cloudflare Workers):

```typescript
import { webcrypto } from "node:crypto";
globalThis.crypto = webcrypto as Crypto;
```

## Core Concepts

### Authorization Code Flow (Standard OAuth 2.0)

**Use for:** Server-side applications with client secrets

**Flow:**
1. Generate state → Create authorization URL → Redirect user
2. Provider redirects back with code + state
3. Verify state → Exchange code for tokens

### Authorization Code Flow with PKCE

**Use for:** Mobile apps, SPAs, and public clients without client secrets

**Flow:**
1. Generate state + code verifier → Create authorization URL with PKCE → Redirect user
2. Provider redirects back with code + state
3. Verify state → Exchange code + verifier for tokens

**Why PKCE:** Protects against authorization code interception attacks in public clients

## Supported Providers (70+)

Popular providers include:
- **Auth:** Apple, Auth0, Authentik, Keycloak, Okta, WorkOS
- **Social:** Discord, Facebook, GitHub, GitLab, Google, LinkedIn, Reddit, Slack, Spotify, Twitch, Twitter
- **Enterprise:** Microsoft Entra ID (Azure AD), Atlassian, Salesforce, Zoom
- **Gaming:** Battle.net, Epic Games, Roblox, Twitch
- **Dev Tools:** Figma, Linear, Notion
- **Payment:** Coinbase, MercadoLibre, Patreon
- **Asian:** Kakao, Line, Naver, MyAnimeList

Full list: https://arcticjs.dev/

## Basic Usage Pattern

### Standard OAuth 2.0 Flow (Server-Side)

```typescript
import * as arctic from "arctic";

// Initialize provider
const github = new arctic.GitHub(clientId, clientSecret, redirectURI);

// Step 1: Generate authorization URL
const state = arctic.generateState();
const scopes = ["user:email", "repo"];
const url = github.createAuthorizationURL(state, scopes);

// Store state as httpOnly cookie (10 min expiry recommended)
setCookie("state", state, {
  secure: true,
  path: "/",
  httpOnly: true,
  maxAge: 60 * 10
});

// Redirect user to authorization URL
return redirect(url);

// Step 2: Handle callback
const code = request.url.searchParams.get("code");
const state = request.url.searchParams.get("state");
const storedState = getCookie("state");

// Validate state
if (!code || !storedState || state !== storedState) {
  throw new Error("Invalid request");
}

// Step 3: Exchange code for tokens
try {
  const tokens = await github.validateAuthorizationCode(code);
  const accessToken = tokens.accessToken();
  const refreshToken = tokens.refreshToken(); // If available
  const accessTokenExpiresAt = tokens.accessTokenExpiresAt(); // If available
} catch (e) {
  if (e instanceof arctic.OAuth2RequestError) {
    // Invalid code, credentials, or redirect URI
    console.error("OAuth error:", e.code, e.message);
  } else if (e instanceof arctic.ArcticFetchError) {
    // Network error
    console.error("Fetch error:", e.cause);
  }
  // UnexpectedResponseError or parse errors
}
```

### PKCE Flow (Mobile/SPA)

```typescript
import * as arctic from "arctic";

// Initialize provider
const google = new arctic.Google(clientId, clientSecret, redirectURI);

// Step 1: Generate authorization URL with PKCE
const state = arctic.generateState();
const codeVerifier = arctic.generateCodeVerifier();
const scopes = ["openid", "profile", "email"];
const url = google.createAuthorizationURL(state, codeVerifier, scopes);

// Store BOTH state and codeVerifier securely
// For mobile: Use secure storage (not AsyncStorage)
// For web: Use httpOnly cookies
setCookie("state", state, { httpOnly: true, secure: true, maxAge: 600 });
setCookie("code_verifier", codeVerifier, { httpOnly: true, secure: true, maxAge: 600 });

// Redirect to authorization URL
return redirect(url);

// Step 2: Handle callback
const code = request.url.searchParams.get("code");
const state = request.url.searchParams.get("state");
const storedState = getCookie("state");
const storedCodeVerifier = getCookie("code_verifier");

if (!code || !storedState || state !== storedState || !storedCodeVerifier) {
  throw new Error("Invalid request");
}

// Step 3: Exchange code + verifier for tokens
try {
  const tokens = await google.validateAuthorizationCode(code, storedCodeVerifier);
  const accessToken = tokens.accessToken();
  const idToken = tokens.idToken(); // For OIDC providers
  const refreshToken = tokens.refreshToken();
} catch (e) {
  // Same error handling as standard flow
}
```

## Provider-Specific Examples

### GitHub

```typescript
const github = new arctic.GitHub(clientId, clientSecret, redirectURI);

// Standard flow (OAuth Apps)
const state = arctic.generateState();
const scopes = ["user:email"];
const url = github.createAuthorizationURL(state, scopes);

// Exchange code
const tokens = await github.validateAuthorizationCode(code);

// GitHub Apps also return refresh tokens
const accessToken = tokens.accessToken();
const refreshToken = tokens.refreshToken(); // GitHub Apps only
const accessTokenExpiresAt = tokens.accessTokenExpiresAt(); // GitHub Apps only

// Get refresh token expiration (GitHub Apps)
if ("refresh_token_expires_in" in tokens.data) {
  const expiresIn = tokens.data.refresh_token_expires_in;
}

// Fetch user data
const response = await fetch("https://api.github.com/user", {
  headers: { Authorization: `Bearer ${accessToken}` }
});
const user = await response.json();
```

### Microsoft Entra ID (Azure AD)

```typescript
// tenant: "common", "organizations", "consumers", or specific tenant ID
const entraId = new arctic.MicrosoftEntraId(
  tenant,
  clientId,
  clientSecret, // null for public clients
  redirectURI
);

// PKCE required
const state = arctic.generateState();
const codeVerifier = arctic.generateCodeVerifier();
const scopes = ["openid", "profile", "email"];
const url = entraId.createAuthorizationURL(state, codeVerifier, scopes);

// IMPORTANT: Entra ID requires nonce for OpenID
// Add after creating URL (can be "_" for server-side OAuth)
url.searchParams.set("nonce", "_");

// Exchange code
const tokens = await entraId.validateAuthorizationCode(code, codeVerifier);
const accessToken = tokens.accessToken();
const idToken = tokens.idToken();
const refreshToken = tokens.refreshToken();

// Decode ID token
const claims = arctic.decodeIdToken(idToken);

// Or use userinfo endpoint
const response = await fetch("https://graph.microsoft.com/oidc/userinfo", {
  headers: { Authorization: `Bearer ${accessToken}` }
});
const user = await response.json();
```

### Google

```typescript
const google = new arctic.Google(clientId, clientSecret, redirectURI);

// PKCE recommended
const state = arctic.generateState();
const codeVerifier = arctic.generateCodeVerifier();
const scopes = ["openid", "profile", "email"];
const url = google.createAuthorizationURL(state, codeVerifier, scopes);

const tokens = await google.validateAuthorizationCode(code, codeVerifier);
const idToken = tokens.idToken();
const claims = arctic.decodeIdToken(idToken);
```

### Apple

```typescript
// Requires PKCS#8 private key as Uint8Array
const apple = new arctic.Apple(
  clientId,
  teamId,
  keyId,
  pkcs8PrivateKey, // Uint8Array
  redirectURI
);

// Convert PEM to PKCS#8
const pemKey = `-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`;
const base64 = pemKey
  .replace(/-----BEGIN PRIVATE KEY-----/, "")
  .replace(/-----END PRIVATE KEY-----/, "")
  .replace(/\s/g, "");
const pkcs8PrivateKey = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

const tokens = await apple.validateAuthorizationCode(code, codeVerifier);
const idToken = tokens.idToken(); // Always returned
```

### Auth0

```typescript
const domain = "xxx.auth0.com"; // No protocol or path
const auth0 = new arctic.Auth0(
  domain,
  clientId,
  clientSecret, // null for public clients
  redirectURI
);

// Confidential clients (with secret)
const state = arctic.generateState();
const scopes = ["openid", "profile"];
const url = auth0.createAuthorizationURL(state, null, scopes);
const tokens = await auth0.validateAuthorizationCode(code, null);

// Public clients (PKCE required)
const codeVerifier = arctic.generateCodeVerifier();
const url = auth0.createAuthorizationURL(state, codeVerifier, scopes);
const tokens = await auth0.validateAuthorizationCode(code, codeVerifier);
```

### Discord

```typescript
const discord = new arctic.Discord(clientId, clientSecret, redirectURI);

const state = arctic.generateState();
const scopes = ["identify", "email"];
const url = discord.createAuthorizationURL(state, scopes);

const tokens = await discord.validateAuthorizationCode(code);
```

## Generic OAuth 2.0 Client

For providers not included or custom implementations:

```typescript
const client = new arctic.OAuth2Client(
  clientId,
  clientSecret, // can be null
  redirectURI   // can be null
);

// Standard flow
const state = arctic.generateState();
const url = client.createAuthorizationURL(
  "https://provider.com/oauth/authorize",
  state,
  ["scope1", "scope2"]
);

// PKCE flow
const codeVerifier = arctic.generateCodeVerifier();
const url = client.createAuthorizationURLWithPKCE(
  "https://provider.com/oauth/authorize",
  state,
  arctic.CodeChallengeMethod.S256, // or CodeChallengeMethod.Plain
  codeVerifier,
  scopes
);

// Exchange code
const tokens = await client.validateAuthorizationCode(
  "https://provider.com/oauth/token",
  code,
  codeVerifier // null for standard flow
);

// Refresh token
const newTokens = await client.refreshAccessToken(
  "https://provider.com/oauth/token",
  refreshToken,
  [] // Empty array to keep same scopes
);

// Revoke token
await client.revokeToken(
  "https://provider.com/oauth/revoke",
  token
);
```

## Token Management

### OAuth2Tokens Methods

```typescript
const tokens = await provider.validateAuthorizationCode(code);

// Parse response fields (throws if missing)
const accessToken = tokens.accessToken();
const refreshToken = tokens.refreshToken();
const idToken = tokens.idToken(); // OIDC providers
const accessTokenExpiresInSeconds = tokens.accessTokenExpiresInSeconds();
const accessTokenExpiresAt = tokens.accessTokenExpiresAt(); // Date object

// Access raw response data
const rawData = tokens.data;
```

### Refresh Access Tokens

```typescript
// Most providers
try {
  const tokens = await provider.refreshAccessToken(refreshToken);
  const newAccessToken = tokens.accessToken();
  const newRefreshToken = tokens.refreshToken(); // May be rotated
} catch (e) {
  if (e instanceof arctic.OAuth2RequestError) {
    // Refresh token invalid - user needs to re-authenticate
  }
}

// Keep same scopes (recommended)
const tokens = await client.refreshAccessToken(tokenEndpoint, refreshToken, []);

// Request new scopes
const tokens = await client.refreshAccessToken(tokenEndpoint, refreshToken, ["new_scope"]);
```

### Revoke Tokens

```typescript
// For providers supporting revocation
try {
  await client.revokeToken(revocationEndpoint, token);
} catch (e) {
  if (e instanceof arctic.OAuth2RequestError) {
    // Token already invalid or revocation failed
  }
}
```

## Error Handling

Arctic throws four types of errors:

```typescript
try {
  const tokens = await provider.validateAuthorizationCode(code);
} catch (e) {
  if (e instanceof arctic.OAuth2RequestError) {
    // OAuth 2.0 error response from provider
    // Invalid code, credentials, or redirect URI
    console.error("OAuth error:", e.code);
    console.error("Description:", e.message);
    console.error("Request:", e.request);
    // e.code examples: "invalid_grant", "invalid_client", "unauthorized_client"
  } else if (e instanceof arctic.ArcticFetchError) {
    // Network error - failed to call fetch()
    console.error("Network error:", e.cause);
  } else if (e instanceof arctic.UnexpectedResponseError) {
    // Non-JSON response or unexpected status code
    console.error("Unexpected response:", e.message);
  } else if (e instanceof arctic.UnexpectedErrorResponseBodyError) {
    // Error response doesn't follow OAuth 2.0 spec
    console.error("Malformed error:", e.message);
  } else {
    // Parse error - missing required fields in response
    console.error("Parse error:", e);
  }
}
```

**Error handling strategy:**
- `OAuth2RequestError`: Show user-friendly message, log to retry
- `ArcticFetchError`: Check network, retry with exponential backoff
- Parse errors: Log for debugging, typically provider issues

## Security Best Practices

### State Parameter

**Purpose:** Prevents CSRF attacks

**Implementation:**
```typescript
// Generate cryptographically secure random string
const state = arctic.generateState(); // 40 characters

// Store in httpOnly cookie
setCookie("state", state, {
  httpOnly: true,  // Prevents XSS
  secure: true,    // HTTPS only
  sameSite: "lax", // CSRF protection
  maxAge: 600,     // 10 minutes
  path: "/"
});

// Verify on callback
if (callbackState !== storedState) {
  throw new Error("State mismatch - possible CSRF attack");
}
```

### PKCE (Proof Key for Code Exchange)

**Purpose:** Protects against authorization code interception

**When required:**
- Mobile applications (iOS/Android)
- Single-page applications (React, Vue, Angular)
- Any public client without client secret

**Implementation:**
```typescript
// Generate code verifier (random string)
const codeVerifier = arctic.generateCodeVerifier(); // 43-128 characters

// Store securely (NOT in localStorage)
// Mobile: Use secure storage (expo-secure-store, react-native-keychain)
// Web: Use httpOnly cookie or sessionStorage as last resort

// Arctic handles code challenge generation (S256 hash)
const url = provider.createAuthorizationURL(state, codeVerifier, scopes);

// Send verifier with token exchange
const tokens = await provider.validateAuthorizationCode(code, codeVerifier);
```

### Secure Storage Recommendations

**Web Applications:**
```typescript
// State and code verifier in httpOnly cookies
setCookie("state", state, { httpOnly: true, secure: true, sameSite: "lax" });
setCookie("code_verifier", codeVerifier, { httpOnly: true, secure: true, sameSite: "lax" });

// Access tokens: Never store in localStorage
// Option 1: httpOnly cookie (best)
// Option 2: Memory only (requires re-auth on refresh)
// Option 3: sessionStorage (XSS risk)
```

**Mobile Applications (React Native/Expo):**
```typescript
// Use secure storage
import * as SecureStore from 'expo-secure-store';

// Store code verifier
await SecureStore.setItemAsync('code_verifier', codeVerifier);

// Retrieve on callback
const storedVerifier = await SecureStore.getItemAsync('code_verifier');

// Clean up after use
await SecureStore.deleteItemAsync('code_verifier');
```

### Redirect URI Security

```typescript
// Always use HTTPS in production
const redirectURI = "https://example.com/auth/callback";

// Localhost exceptions for development
const redirectURI = process.env.NODE_ENV === "development"
  ? "http://localhost:3000/auth/callback"
  : "https://example.com/auth/callback";

// Mobile deep links
const redirectURI = "myapp://auth/callback";

// Expo deep links
const redirectURI = "exp://192.168.1.100:8081/--/auth/callback"; // Dev
const redirectURI = "myapp://auth/callback"; // Production
```

### Token Storage

**Access Tokens:**
- **Web:** httpOnly cookies with short expiry (1 hour)
- **Mobile:** Secure storage with biometric access
- **Never:** localStorage, sessionStorage, or in-memory without refresh strategy

**Refresh Tokens:**
- **Web:** httpOnly cookies with long expiry
- **Mobile:** Secure storage with encryption
- **Rotation:** Handle refresh token rotation (some providers issue new refresh tokens)

```typescript
// Example: Refresh token rotation
const tokens = await provider.refreshAccessToken(refreshToken);
const newAccessToken = tokens.accessToken();
const newRefreshToken = tokens.refreshToken(); // May be new

// Update stored refresh token
if (newRefreshToken !== refreshToken) {
  await updateRefreshToken(newRefreshToken);
}
```

## Mobile-Specific Patterns (Expo/React Native)

### Complete PKCE Flow for Mobile

```typescript
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import * as arctic from 'arctic';

// Step 1: Initialize provider
const provider = new arctic.Google(
  CLIENT_ID,
  CLIENT_SECRET, // Can be null for public clients
  Linking.createURL('/auth/callback') // Deep link redirect URI
);

// Step 2: Start authentication
async function login() {
  const state = arctic.generateState();
  const codeVerifier = arctic.generateCodeVerifier();
  
  // Store securely
  await SecureStore.setItemAsync('oauth_state', state);
  await SecureStore.setItemAsync('code_verifier', codeVerifier);
  
  const scopes = ['openid', 'profile', 'email'];
  const authUrl = provider.createAuthorizationURL(state, codeVerifier, scopes);
  
  // Open browser
  const result = await WebBrowser.openAuthSessionAsync(
    authUrl.toString(),
    Linking.createURL('/auth/callback')
  );
  
  if (result.type === 'success') {
    handleCallback(result.url);
  }
}

// Step 3: Handle callback
async function handleCallback(url: string) {
  const { queryParams } = Linking.parse(url);
  const code = queryParams.code;
  const state = queryParams.state;
  
  // Retrieve stored values
  const storedState = await SecureStore.getItemAsync('oauth_state');
  const codeVerifier = await SecureStore.getItemAsync('code_verifier');
  
  // Validate
  if (!code || !state || state !== storedState || !codeVerifier) {
    throw new Error('Invalid OAuth callback');
  }
  
  // Clean up
  await SecureStore.deleteItemAsync('oauth_state');
  await SecureStore.deleteItemAsync('code_verifier');
  
  // Exchange code
  try {
    const tokens = await provider.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();
    const refreshToken = tokens.refreshToken();
    
    // Store tokens securely
    await SecureStore.setItemAsync('access_token', accessToken);
    await SecureStore.setItemAsync('refresh_token', refreshToken);
    
  } catch (e) {
    // Handle errors
  }
}

// Step 4: Use stored tokens
async function fetchUserData() {
  const accessToken = await SecureStore.getItemAsync('access_token');
  
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (response.status === 401) {
    // Token expired, refresh it
    await refreshAccessToken();
    return fetchUserData(); // Retry
  }
  
  return response.json();
}

// Step 5: Refresh tokens
async function refreshAccessToken() {
  const refreshToken = await SecureStore.getItemAsync('refresh_token');
  
  try {
    const tokens = await provider.refreshAccessToken(refreshToken);
    const newAccessToken = tokens.accessToken();
    const newRefreshToken = tokens.refreshToken();
    
    await SecureStore.setItemAsync('access_token', newAccessToken);
    
    // Handle token rotation
    if (newRefreshToken !== refreshToken) {
      await SecureStore.setItemAsync('refresh_token', newRefreshToken);
    }
  } catch (e) {
    // Refresh failed - require re-authentication
    await logout();
  }
}

async function logout() {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
}
```

## PayloadCMS Integration Pattern

Arctic works excellently with PayloadCMS for custom OAuth strategies:

```typescript
// payload.config.ts
import * as arctic from 'arctic';
import type { Config } from 'payload/config';

// Initialize provider
const github = new arctic.GitHub(
  process.env.GITHUB_CLIENT_ID!,
  process.env.GITHUB_CLIENT_SECRET!,
  `${process.env.PAYLOAD_PUBLIC_SERVER_URL}/api/auth/github/callback`
);

export default {
  admin: {
    // ... admin config
  },
  collections: [
    {
      slug: 'users',
      auth: {
        // Custom OAuth strategy
        strategies: [
          {
            name: 'github-oauth',
            authenticate: async ({ payload, req }) => {
              const { code, state } = req.query;
              
              // Verify state from session/cookie
              const storedState = req.session?.oauthState;
              if (state !== storedState) {
                throw new Error('Invalid state');
              }
              
              try {
                // Exchange code for tokens
                const tokens = await github.validateAuthorizationCode(code as string);
                const accessToken = tokens.accessToken();
                
                // Fetch user from GitHub
                const response = await fetch('https://api.github.com/user', {
                  headers: { Authorization: `Bearer ${accessToken}` }
                });
                const githubUser = await response.json();
                
                // Find or create user in Payload
                let user = await payload.find({
                  collection: 'users',
                  where: { githubId: { equals: githubUser.id } }
                });
                
                if (user.docs.length === 0) {
                  user = await payload.create({
                    collection: 'users',
                    data: {
                      email: githubUser.email,
                      githubId: githubUser.id,
                      name: githubUser.name,
                    }
                  });
                } else {
                  user = user.docs[0];
                }
                
                return { user };
              } catch (e) {
                throw new Error('GitHub authentication failed');
              }
            }
          }
        ]
      },
      fields: [
        { name: 'email', type: 'email', required: true, unique: true },
        { name: 'githubId', type: 'text', unique: true },
        { name: 'name', type: 'text' },
      ]
    }
  ]
} satisfies Config;

// Auth initiation endpoint
app.get('/api/auth/github', (req, res) => {
  const state = arctic.generateState();
  
  // Store state in session
  req.session.oauthState = state;
  
  const scopes = ['user:email'];
  const url = github.createAuthorizationURL(state, scopes);
  
  res.redirect(url.toString());
});
```

## OpenID Connect (OIDC) Support

Many providers support OIDC. Arctic provides ID token decoding:

```typescript
// Request openid scope
const scopes = ["openid", "profile", "email"];
const url = provider.createAuthorizationURL(state, codeVerifier, scopes);

// Get ID token
const tokens = await provider.validateAuthorizationCode(code, codeVerifier);
const idToken = tokens.idToken();

// Decode (does NOT verify signature)
const claims = arctic.decodeIdToken(idToken);
console.log(claims);
// {
//   sub: "user-id",
//   name: "John Doe",
//   email: "john@example.com",
//   email_verified: true,
//   iat: 1234567890,
//   exp: 1234571490
// }
```

**Important:** `decodeIdToken()` only decodes the JWT payload. It does NOT verify:
- Signature (RS256/HS256)
- Expiration
- Issuer
- Audience

For production, use a JWT library like `jose` to verify ID tokens.

## Common Patterns & Solutions

### Handle Multiple Providers

```typescript
type Provider = 'github' | 'google' | 'microsoft';

const providers = {
  github: new arctic.GitHub(
    process.env.GITHUB_CLIENT_ID!,
    process.env.GITHUB_CLIENT_SECRET!,
    `${BASE_URL}/auth/github/callback`
  ),
  google: new arctic.Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${BASE_URL}/auth/google/callback`
  ),
  microsoft: new arctic.MicrosoftEntraId(
    'common',
    process.env.MICROSOFT_CLIENT_ID!,
    process.env.MICROSOFT_CLIENT_SECRET!,
    `${BASE_URL}/auth/microsoft/callback`
  ),
};

// Initiate login
app.get('/auth/:provider', (req, res) => {
  const provider = providers[req.params.provider];
  if (!provider) return res.status(404).send('Provider not found');
  
  const state = arctic.generateState();
  setCookie(res, 'state', state);
  setCookie(res, 'provider', req.params.provider);
  
  // Handle both PKCE and non-PKCE providers
  const usePKCE = ['google', 'microsoft'].includes(req.params.provider);
  
  if (usePKCE) {
    const codeVerifier = arctic.generateCodeVerifier();
    setCookie(res, 'code_verifier', codeVerifier);
    const url = provider.createAuthorizationURL(state, codeVerifier, scopes);
    return res.redirect(url.toString());
  }
  
  const url = provider.createAuthorizationURL(state, scopes);
  res.redirect(url.toString());
});

// Handle callback
app.get('/auth/:provider/callback', async (req, res) => {
  const providerName = getCookie(req, 'provider');
  const provider = providers[providerName];
  
  const { code, state } = req.query;
  const storedState = getCookie(req, 'state');
  const codeVerifier = getCookie(req, 'code_verifier');
  
  if (state !== storedState) {
    return res.status(400).send('Invalid state');
  }
  
  try {
    const tokens = codeVerifier
      ? await provider.validateAuthorizationCode(code, codeVerifier)
      : await provider.validateAuthorizationCode(code);
    
    // Process tokens...
  } catch (e) {
    // Handle error...
  }
});
```

### Automatic Token Refresh

```typescript
class TokenManager {
  private accessToken: string;
  private refreshToken: string;
  private expiresAt: Date;
  
  constructor(
    private provider: any,
    tokens: any
  ) {
    this.updateTokens(tokens);
  }
  
  private updateTokens(tokens: any) {
    this.accessToken = tokens.accessToken();
    this.refreshToken = tokens.refreshToken();
    this.expiresAt = tokens.accessTokenExpiresAt();
  }
  
  async getValidAccessToken(): Promise<string> {
    // Refresh 5 minutes before expiry
    const buffer = 5 * 60 * 1000;
    if (Date.now() >= this.expiresAt.getTime() - buffer) {
      await this.refresh();
    }
    return this.accessToken;
  }
  
  private async refresh() {
    try {
      const tokens = await this.provider.refreshAccessToken(this.refreshToken);
      this.updateTokens(tokens);
    } catch (e) {
      // Refresh failed - require re-authentication
      throw new Error('Session expired - please login again');
    }
  }
}

// Usage
const tokenManager = new TokenManager(provider, initialTokens);
const accessToken = await tokenManager.getValidAccessToken();
```

### Scope Management

```typescript
// Define scopes per provider
const PROVIDER_SCOPES = {
  github: ['user:email', 'read:user'],
  google: ['openid', 'profile', 'email'],
  microsoft: ['openid', 'profile', 'email', 'User.Read'],
  discord: ['identify', 'email'],
};

// Request minimal scopes initially
const basicScopes = ['profile', 'email'];

// Request additional scopes later
async function requestAdditionalScopes(provider, additionalScopes: string[]) {
  const state = arctic.generateState();
  const allScopes = [...basicScopes, ...additionalScopes];
  const url = provider.createAuthorizationURL(state, allScopes);
  return url;
}
```

## TypeScript Support

Arctic is fully typed. Import types for better DX:

```typescript
import * as arctic from 'arctic';
import type { OAuth2Tokens } from 'arctic';

// Provider-specific types
import type { GitHubTokens } from 'arctic';
import type { GoogleTokens } from 'arctic';
import type { MicrosoftEntraIdTokens } from 'arctic';

// Custom type guards
function isOAuth2RequestError(error: unknown): error is arctic.OAuth2RequestError {
  return error instanceof arctic.OAuth2RequestError;
}

// Token type example
function handleTokens(tokens: OAuth2Tokens) {
  const accessToken: string = tokens.accessToken();
  const expiresAt: Date | null = tokens.accessTokenExpiresAt();
  const refreshToken: string | null = tokens.refreshToken();
}
```

## Debugging & Troubleshooting

### Enable Debug Logging

```typescript
// Log all OAuth requests
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (typeof input === 'string' && input.includes('oauth')) {
    console.log('OAuth Request:', input, init);
  }
  const response = await originalFetch(input, init);
  if (typeof input === 'string' && input.includes('oauth')) {
    const clone = response.clone();
    const body = await clone.text();
    console.log('OAuth Response:', response.status, body);
  }
  return response;
};
```

### Common Issues

**Issue: "Invalid state" errors**
- Solution: Check cookie configuration (secure, sameSite, path)
- Solution: Verify state storage/retrieval timing
- Solution: Check cookie expiry (10 min recommended)

**Issue: "Invalid redirect URI"**
- Solution: Exact match required (protocol, domain, path, port)
- Solution: Check provider dashboard configuration
- Solution: URL encode special characters

**Issue: PKCE validation fails**
- Solution: Ensure code verifier stored securely
- Solution: Verify verifier not modified during storage
- Solution: Check S256 challenge method supported

**Issue: Token expired immediately**
- Solution: Check server time synchronization
- Solution: Verify timezone handling in expiresAt
- Solution: Add buffer time before expiry

**Issue: CORS errors**
- Solution: OAuth flow must use redirects, not fetch
- Solution: Never call OAuth endpoints from frontend
- Solution: Use proper server-side callback endpoint

### Testing

```typescript
// Mock Arctic for tests
jest.mock('arctic', () => ({
  GitHub: jest.fn().mockImplementation(() => ({
    createAuthorizationURL: jest.fn().mockReturnValue('https://github.com/login/oauth/authorize?...'),
    validateAuthorizationCode: jest.fn().mockResolvedValue({
      accessToken: () => 'mock-access-token',
      refreshToken: () => 'mock-refresh-token',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
    }),
  })),
  generateState: jest.fn().mockReturnValue('mock-state'),
  generateCodeVerifier: jest.fn().mockReturnValue('mock-code-verifier'),
}));
```

## Migration Notes

### From v1 to v3

Major changes:
- Providers no longer include `openid` scope by default (must specify)
- Error types changed: `OAuth2RequestError` replaces old error structure
- New errors: `ArcticFetchError`, `UnexpectedResponseError`
- Some provider initialization parameters changed
- Token methods return values or throw (no null returns)

### From Auth.js / NextAuth

```typescript
// Auth.js pattern
providers: [
  GitHubProvider({
    clientId: process.env.GITHUB_ID,
    clientSecret: process.env.GITHUB_SECRET,
  })
]

// Arctic equivalent
const github = new arctic.GitHub(
  process.env.GITHUB_ID,
  process.env.GITHUB_SECRET,
  `${process.env.NEXTAUTH_URL}/api/auth/callback/github`
);

// Manual route handler
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  
  // ... Arctic flow
}
```

## Performance Tips

1. **Reuse provider instances**: Create once, use many times
2. **Cache tokens appropriately**: Respect expiry times
3. **Use connection pooling**: Fetch uses HTTP/2 automatically
4. **Implement request deduplication**: For concurrent token refreshes
5. **Set timeouts**: Wrap Arctic calls with timeout promises

```typescript
// Timeout wrapper
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  );
  return Promise.race([promise, timeout]);
}

const tokens = await withTimeout(
  provider.validateAuthorizationCode(code),
  10000 // 10 second timeout
);
```

## Version Compatibility

- **Arctic v3**: Current stable, recommended for new projects
- **Arctic v2**: Deprecated, migrate to v3
- **Arctic v1**: Legacy, see v1.arcticjs.dev

**Node.js:** 18+ (with polyfill), 20+ (native)
**Bun:** All versions
**Deno:** All versions
**Cloudflare Workers:** All versions
**Other runtimes:** Any runtime with Fetch API + Web Crypto

## Resources

- **Documentation:** https://arcticjs.dev
- **GitHub:** https://github.com/pilcrowonpaper/arctic
- **Provider guides:** Check each provider's page for specific requirements
- **OAuth 2.0 spec:** https://oauth.net/2/

## Quick Reference Card

```typescript
// Standard Flow
const state = arctic.generateState();
const url = provider.createAuthorizationURL(state, scopes);
const tokens = await provider.validateAuthorizationCode(code);

// PKCE Flow
const state = arctic.generateState();
const verifier = arctic.generateCodeVerifier();
const url = provider.createAuthorizationURL(state, verifier, scopes);
const tokens = await provider.validateAuthorizationCode(code, verifier);

// Token Operations
const access = tokens.accessToken();
const refresh = tokens.refreshToken();
const expires = tokens.accessTokenExpiresAt();
const id = tokens.idToken();

// Refresh
const newTokens = await provider.refreshAccessToken(refreshToken);

// Decode ID Token (OIDC)
const claims = arctic.decodeIdToken(idToken);

// Generic Client
const client = new arctic.OAuth2Client(clientId, secret, redirectURI);

// Error Handling
try { } catch (e) {
  if (e instanceof arctic.OAuth2RequestError) { /* OAuth error */ }
  if (e instanceof arctic.ArcticFetchError) { /* Network error */ }
}
```