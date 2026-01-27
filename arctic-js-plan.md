# PayloadCMS Arctic OAuth Plugin: Implementation Plan

A thin wrapper around [Arctic](https://arcticjs.dev/) to provide OAuth authentication for PayloadCMS with minimal configuration.

---

## Goal

Create a PayloadCMS plugin where adding OAuth is as simple as:

```typescript
// payload.config.ts
import { buildConfig } from 'payload'
import { arcticOAuthPlugin, googleProvider, entraProvider } from '@your-org/payload-arctic-oauth'

export default buildConfig({
  // ...
  plugins: [
    arcticOAuthPlugin({
      providers: {
        google: googleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        entra: entraProvider({
          clientId: process.env.ENTRA_CLIENT_ID!,
          clientSecret: process.env.ENTRA_CLIENT_SECRET!,
          tenantId: process.env.ENTRA_TENANT_ID!,
        }),
      },
      userCollection: 'users', // optional, defaults to 'users'
    }),
  ],
})
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PLUGIN STRUCTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  arcticOAuthPlugin(config)                                                  │
│       │                                                                     │
│       ├── Injects endpoints to user collection:                             │
│       │   • GET  /api/{collection}/oauth/{provider}          (authorize)    │
│       │   • GET  /api/{collection}/oauth/{provider}/callback (callback)     │
│       │                                                                     │
│       ├── Adds fields to user collection:                                   │
│       │   • oauthAccounts: array of { provider, providerId, ... }           │
│       │                                                                     │
│       └── Registers auth strategy:                                          │
│           • Validates OAuth tokens on API requests                          │
│                                                                             │
│  Provider Adapters (thin wrappers on Arctic)                                │
│       │                                                                     │
│       ├── googleProvider()   →  new arctic.Google(...)                      │
│       ├── entraProvider()    →  new arctic.MicrosoftEntraId(...)            │
│       ├── githubProvider()   →  new arctic.GitHub(...)                      │
│       └── ... (70+ providers available via Arctic)                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Plugin Config Interface

```typescript
// src/types.ts

import type { CollectionSlug } from 'payload'

/**
 * Base interface all providers implement
 */
export interface OAuthProvider {
  /** Unique identifier for this provider (e.g., 'google', 'entra') */
  name: string
  
  /** Whether this provider uses PKCE */
  usesPKCE: boolean
  
  /** Default scopes for this provider */
  defaultScopes: string[]
  
  /** Create the Arctic client instance */
  createClient(redirectUri: string): ArcticClient
  
  /** Fetch user info from provider using access token */
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>
}

/**
 * Standardized user info returned by all providers
 */
export interface OAuthUserInfo {
  /** Provider's unique user ID */
  providerId: string
  /** User's email (may be undefined for some providers) */
  email?: string
  /** User's display name */
  name?: string
  /** User's first name */
  firstName?: string
  /** User's last name */
  lastName?: string
  /** URL to user's avatar */
  avatarUrl?: string
  /** Raw claims from provider (for custom mapping) */
  rawClaims: Record<string, unknown>
}

/**
 * Arctic client interface (what Arctic providers expose)
 */
export interface ArcticClient {
  createAuthorizationURL(state: string, scopes: string[]): URL
  createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL // PKCE
  validateAuthorizationCode(code: string): Promise<OAuth2Tokens>
  validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens> // PKCE
}

/**
 * Main plugin configuration
 */
export interface ArcticOAuthPluginConfig {
  /**
   * Configured OAuth providers
   * Keys become the provider slug in URLs: /oauth/{key}
   */
  providers: Record<string, OAuthProvider>
  
  /**
   * User collection to add OAuth to
   * @default 'users'
   */
  userCollection?: CollectionSlug
  
  /**
   * Auto-create users on first OAuth login
   * @default true
   */
  autoCreateUsers?: boolean
  
  /**
   * URL to redirect after successful login (web only)
   * @default '/admin'
   */
  successRedirect?: string
  
  /**
   * URL to redirect on failure (web only)
   * @default '/admin/login?error=oauth_failed'
   */
  failureRedirect?: string
  
  /**
   * For mobile apps: redirect URI scheme
   * If provided, callback returns a deep link instead of web redirect
   * @example 'myapp://auth/callback'
   */
  mobileRedirectScheme?: string
  
  /**
   * Hook called before user creation
   * Return modified data or throw to reject
   */
  beforeUserCreate?: (args: {
    userInfo: OAuthUserInfo
    provider: string
  }) => Promise<Record<string, unknown>>
  
  /**
   * Hook called after successful login
   */
  afterLogin?: (args: {
    user: Record<string, unknown>
    userInfo: OAuthUserInfo
    provider: string
  }) => Promise<void>
  
  /**
   * Map provider user info to Payload user fields
   * @default Maps email, name to standard fields
   */
  mapUserFields?: (userInfo: OAuthUserInfo, provider: string) => Record<string, unknown>
}
```

---

## Provider Factory Pattern

Each provider is a factory function that returns an `OAuthProvider`:

```typescript
// src/providers/google.ts

import { Google } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from '../types'

export interface GoogleProviderConfig {
  clientId: string
  clientSecret: string
  /** Additional scopes beyond 'openid profile email' */
  scopes?: string[]
}

export function googleProvider(config: GoogleProviderConfig): OAuthProvider {
  return {
    name: 'google',
    usesPKCE: true,
    defaultScopes: ['openid', 'profile', 'email', ...(config.scopes || [])],
    
    createClient(redirectUri: string) {
      return new Google(config.clientId, config.clientSecret, redirectUri)
    },
    
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
      // Google's userinfo endpoint
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Google user info: ${response.status}`)
      }
      
      const claims = await response.json()
      
      return {
        providerId: claims.sub,
        email: claims.email,
        name: claims.name,
        firstName: claims.given_name,
        lastName: claims.family_name,
        avatarUrl: claims.picture,
        rawClaims: claims,
      }
    },
  }
}
```

```typescript
// src/providers/entra.ts

import { MicrosoftEntraId } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from '../types'

export interface EntraProviderConfig {
  clientId: string
  clientSecret: string
  tenantId: string
  /** Additional scopes beyond 'openid profile email' */
  scopes?: string[]
}

export function entraProvider(config: EntraProviderConfig): OAuthProvider {
  return {
    name: 'entra',
    usesPKCE: true,
    defaultScopes: ['openid', 'profile', 'email', 'User.Read', ...(config.scopes || [])],
    
    createClient(redirectUri: string) {
      return new MicrosoftEntraId(config.tenantId, config.clientId, config.clientSecret, redirectUri)
    },
    
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
      // Microsoft Graph API
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Entra user info: ${response.status}`)
      }
      
      const claims = await response.json()
      
      return {
        providerId: claims.id,
        email: claims.mail || claims.userPrincipalName,
        name: claims.displayName,
        firstName: claims.givenName,
        lastName: claims.surname,
        rawClaims: claims,
      }
    },
  }
}
```

---

## Core Plugin Implementation

```typescript
// src/plugin.ts

import type { Config, Plugin, Endpoint, Field } from 'payload'
import type { ArcticOAuthPluginConfig } from './types'
import { createAuthorizeEndpoint, createCallbackEndpoint } from './endpoints'
import { createOAuthStrategy } from './strategy'

export const arcticOAuthPlugin = (pluginConfig: ArcticOAuthPluginConfig): Plugin => {
  const userCollectionSlug = pluginConfig.userCollection || 'users'
  
  return (incomingConfig: Config): Config => {
    // Build redirect URI base from server URL
    const baseUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000'
    
    // Create endpoints for each provider
    const oauthEndpoints: Endpoint[] = []
    
    for (const [providerKey, provider] of Object.entries(pluginConfig.providers)) {
      const redirectUri = `${baseUrl}/api/${userCollectionSlug}/oauth/${providerKey}/callback`
      const client = provider.createClient(redirectUri)
      
      oauthEndpoints.push(
        createAuthorizeEndpoint(providerKey, provider, client, pluginConfig),
        createCallbackEndpoint(providerKey, provider, client, pluginConfig),
      )
    }
    
    // OAuth accounts field
    const oauthAccountsField: Field = {
      name: 'oauthAccounts',
      type: 'array',
      admin: {
        readOnly: true,
        condition: (data) => data?.oauthAccounts?.length > 0,
      },
      fields: [
        { name: 'provider', type: 'text', required: true },
        { name: 'providerId', type: 'text', required: true },
        { name: 'email', type: 'email' },
        { name: 'connectedAt', type: 'date' },
      ],
    }
    
    // Modify collections
    const collections = (incomingConfig.collections || []).map((collection) => {
      if (collection.slug !== userCollectionSlug) {
        return collection
      }
      
      return {
        ...collection,
        endpoints: [
          ...(collection.endpoints || []),
          ...oauthEndpoints,
        ],
        fields: [
          ...(collection.fields || []),
          oauthAccountsField,
        ],
        auth: {
          ...(typeof collection.auth === 'object' ? collection.auth : {}),
          strategies: [
            ...((typeof collection.auth === 'object' && collection.auth.strategies) || []),
            createOAuthStrategy(pluginConfig),
          ],
        },
      }
    })
    
    return {
      ...incomingConfig,
      collections,
    }
  }
}
```

---

## Endpoints Implementation

```typescript
// src/endpoints/authorize.ts

import type { Endpoint } from 'payload'
import { generateState, generateCodeVerifier } from 'arctic'
import type { OAuthProvider, ArcticClient, ArcticOAuthPluginConfig } from '../types'

const STATE_COOKIE = 'oauth_state'
const VERIFIER_COOKIE = 'oauth_code_verifier'
const REDIRECT_COOKIE = 'oauth_redirect'
const COOKIE_MAX_AGE = 60 * 10 // 10 minutes

export function createAuthorizeEndpoint(
  providerKey: string,
  provider: OAuthProvider,
  client: ArcticClient,
  config: ArcticOAuthPluginConfig,
): Endpoint {
  return {
    path: `/oauth/${providerKey}`,
    method: 'get',
    handler: async (req) => {
      const url = new URL(req.url)
      
      // Optional: mobile redirect override
      const mobileRedirect = url.searchParams.get('redirect')
      
      // Generate state
      const state = generateState()
      
      // Build authorization URL
      let authorizationUrl: URL
      
      if (provider.usesPKCE) {
        const codeVerifier = generateCodeVerifier()
        authorizationUrl = client.createAuthorizationURL(state, codeVerifier, provider.defaultScopes)
        
        // Store code verifier in cookie
        const headers = new Headers()
        headers.append('Set-Cookie', `${VERIFIER_COOKIE}=${codeVerifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`)
        headers.append('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`)
        
        if (mobileRedirect) {
          headers.append('Set-Cookie', `${REDIRECT_COOKIE}=${encodeURIComponent(mobileRedirect)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`)
        }
        
        headers.set('Location', authorizationUrl.toString())
        return new Response(null, { status: 302, headers })
      } else {
        authorizationUrl = client.createAuthorizationURL(state, provider.defaultScopes)
        
        const headers = new Headers()
        headers.append('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`)
        
        if (mobileRedirect) {
          headers.append('Set-Cookie', `${REDIRECT_COOKIE}=${encodeURIComponent(mobileRedirect)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`)
        }
        
        headers.set('Location', authorizationUrl.toString())
        return new Response(null, { status: 302, headers })
      }
    },
  }
}
```

```typescript
// src/endpoints/callback.ts

import type { Endpoint } from 'payload'
import { OAuth2RequestError } from 'arctic'
import type { OAuthProvider, ArcticClient, ArcticOAuthPluginConfig } from '../types'
import { parseCookies, clearOAuthCookies } from '../utils/cookies'

const STATE_COOKIE = 'oauth_state'
const VERIFIER_COOKIE = 'oauth_code_verifier'
const REDIRECT_COOKIE = 'oauth_redirect'

export function createCallbackEndpoint(
  providerKey: string,
  provider: OAuthProvider,
  client: ArcticClient,
  config: ArcticOAuthPluginConfig,
): Endpoint {
  return {
    path: `/oauth/${providerKey}/callback`,
    method: 'get',
    handler: async (req) => {
      const url = new URL(req.url)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      
      // Parse cookies
      const cookies = parseCookies(req.headers.get('cookie') || '')
      const storedState = cookies[STATE_COOKIE]
      const codeVerifier = cookies[VERIFIER_COOKIE]
      const mobileRedirect = cookies[REDIRECT_COOKIE] 
        ? decodeURIComponent(cookies[REDIRECT_COOKIE]) 
        : null
      
      // Always clear OAuth cookies
      const clearCookieHeaders = clearOAuthCookies()
      
      // Handle OAuth error
      if (error) {
        return redirectWithError(config, mobileRedirect, error, clearCookieHeaders)
      }
      
      // Validate state
      if (!code || !state || state !== storedState) {
        return redirectWithError(config, mobileRedirect, 'invalid_state', clearCookieHeaders)
      }
      
      // For PKCE providers, validate code verifier exists
      if (provider.usesPKCE && !codeVerifier) {
        return redirectWithError(config, mobileRedirect, 'missing_verifier', clearCookieHeaders)
      }
      
      try {
        // Exchange code for tokens
        const tokens = provider.usesPKCE
          ? await client.validateAuthorizationCode(code, codeVerifier!)
          : await client.validateAuthorizationCode(code)
        
        const accessToken = tokens.accessToken()
        
        // Get user info from provider
        const userInfo = await provider.getUserInfo(accessToken)
        
        // Find or create user in Payload
        const user = await findOrCreateUser(req.payload, {
          provider: providerKey,
          userInfo,
          config,
        })
        
        if (!user) {
          return redirectWithError(config, mobileRedirect, 'user_creation_failed', clearCookieHeaders)
        }
        
        // Call afterLogin hook if provided
        if (config.afterLogin) {
          await config.afterLogin({ user, userInfo, provider: providerKey })
        }
        
        // Generate Payload JWT
        const payloadToken = await req.payload.auth({
          collection: config.userCollection || 'users',
          user,
        })
        
        // Redirect with token
        return redirectWithSuccess(config, mobileRedirect, payloadToken, clearCookieHeaders)
        
      } catch (e) {
        if (e instanceof OAuth2RequestError) {
          console.error('OAuth error:', e.code, e.message)
          return redirectWithError(config, mobileRedirect, e.code, clearCookieHeaders)
        }
        
        console.error('Unexpected OAuth error:', e)
        return redirectWithError(config, mobileRedirect, 'server_error', clearCookieHeaders)
      }
    },
  }
}

async function findOrCreateUser(
  payload: Payload,
  args: {
    provider: string
    userInfo: OAuthUserInfo
    config: ArcticOAuthPluginConfig
  },
) {
  const { provider, userInfo, config } = args
  const collectionSlug = config.userCollection || 'users'
  
  // First, try to find by OAuth account
  const existingByOAuth = await payload.find({
    collection: collectionSlug,
    where: {
      and: [
        { 'oauthAccounts.provider': { equals: provider } },
        { 'oauthAccounts.providerId': { equals: userInfo.providerId } },
      ],
    },
    limit: 1,
  })
  
  if (existingByOAuth.docs.length > 0) {
    return existingByOAuth.docs[0]
  }
  
  // Try to find by email (if available)
  if (userInfo.email) {
    const existingByEmail = await payload.find({
      collection: collectionSlug,
      where: { email: { equals: userInfo.email } },
      limit: 1,
    })
    
    if (existingByEmail.docs.length > 0) {
      // Link OAuth account to existing user
      const existingUser = existingByEmail.docs[0]
      const oauthAccounts = existingUser.oauthAccounts || []
      
      await payload.update({
        collection: collectionSlug,
        id: existingUser.id,
        data: {
          oauthAccounts: [
            ...oauthAccounts,
            {
              provider,
              providerId: userInfo.providerId,
              email: userInfo.email,
              connectedAt: new Date().toISOString(),
            },
          ],
        },
      })
      
      return existingUser
    }
  }
  
  // Auto-create new user (if enabled)
  if (config.autoCreateUsers !== false) {
    // Map user fields
    const mappedFields = config.mapUserFields
      ? config.mapUserFields(userInfo, provider)
      : {
          email: userInfo.email,
          name: userInfo.name,
        }
    
    // Call beforeUserCreate hook if provided
    let userData = mappedFields
    if (config.beforeUserCreate) {
      userData = await config.beforeUserCreate({ userInfo, provider })
    }
    
    const newUser = await payload.create({
      collection: collectionSlug,
      data: {
        ...userData,
        oauthAccounts: [
          {
            provider,
            providerId: userInfo.providerId,
            email: userInfo.email,
            connectedAt: new Date().toISOString(),
          },
        ],
      },
    })
    
    return newUser
  }
  
  return null
}

function redirectWithSuccess(
  config: ArcticOAuthPluginConfig,
  mobileRedirect: string | null,
  token: string,
  clearCookieHeaders: string[],
) {
  const headers = new Headers()
  clearCookieHeaders.forEach(h => headers.append('Set-Cookie', h))
  
  if (mobileRedirect) {
    // Mobile: redirect to deep link with token
    const redirectUrl = new URL(mobileRedirect)
    redirectUrl.searchParams.set('token', token)
    headers.set('Location', redirectUrl.toString())
  } else {
    // Web: set cookie and redirect
    headers.append('Set-Cookie', `payload-token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`)
    headers.set('Location', config.successRedirect || '/admin')
  }
  
  return new Response(null, { status: 302, headers })
}

function redirectWithError(
  config: ArcticOAuthPluginConfig,
  mobileRedirect: string | null,
  error: string,
  clearCookieHeaders: string[],
) {
  const headers = new Headers()
  clearCookieHeaders.forEach(h => headers.append('Set-Cookie', h))
  
  if (mobileRedirect) {
    const redirectUrl = new URL(mobileRedirect)
    redirectUrl.searchParams.set('error', error)
    headers.set('Location', redirectUrl.toString())
  } else {
    const failureUrl = new URL(config.failureRedirect || '/admin/login', 'http://localhost')
    failureUrl.searchParams.set('error', error)
    headers.set('Location', failureUrl.pathname + failureUrl.search)
  }
  
  return new Response(null, { status: 302, headers })
}
```

---

## Package Structure

```
payload-arctic-oauth/
├── package.json
├── tsconfig.json
├── .swcrc
├── README.md
└── src/
    ├── index.ts              # Main exports
    ├── plugin.ts             # Plugin implementation
    ├── types.ts              # TypeScript interfaces
    ├── defaults.ts           # Default config values
    │
    ├── providers/            # Provider factories
    │   ├── index.ts          # Re-exports all providers
    │   ├── google.ts
    │   ├── entra.ts
    │   ├── github.ts
    │   ├── discord.ts
    │   ├── apple.ts
    │   └── ... (add as needed)
    │
    ├── endpoints/            # Payload endpoints
    │   ├── authorize.ts
    │   └── callback.ts
    │
    ├── strategy.ts           # Auth strategy (optional)
    │
    └── utils/
        ├── cookies.ts        # Cookie helpers
        └── tokens.ts         # Token utilities
```

---

## Implementation Phases

### Phase 1: Core Plugin (4-6 hours)

1. Set up package with SWC build
2. Implement plugin.ts with config spreading
3. Implement types.ts
4. Create cookie utilities

### Phase 2: First Provider - Google (2-3 hours)

1. Implement googleProvider factory
2. Implement authorize endpoint
3. Implement callback endpoint
4. Test full flow

### Phase 3: Add Entra Provider (1-2 hours)

1. Implement entraProvider factory
2. Handle tenant-specific configuration
3. Test flow

### Phase 4: User Management (2-3 hours)

1. Implement findOrCreateUser logic
2. Add beforeUserCreate hook
3. Add afterLogin hook
4. Handle email linking

### Phase 5: Mobile Support (2-3 hours)

1. Add `redirect` query param support
2. Return deep link with token
3. Test with Expo app

### Phase 6: Additional Providers (30-60 min each)

1. GitHub
2. Discord
3. Apple (requires special handling)
4. Slack
5. LinkedIn

### Phase 7: Polish & Publish (2-3 hours)

1. Documentation
2. Error handling improvements
3. Tests
4. npm publish

---

## Total Estimated Time

| Phase | Time |
|-------|------|
| Core Plugin | 4-6 hours |
| Google Provider | 2-3 hours |
| Entra Provider | 1-2 hours |
| User Management | 2-3 hours |
| Mobile Support | 2-3 hours |
| Additional Providers | 2-4 hours |
| Polish & Publish | 2-3 hours |
| **Total** | **15-24 hours** |

---

## Usage Examples

### Basic Web Authentication

```typescript
// payload.config.ts
import { arcticOAuthPlugin, googleProvider } from '@your-org/payload-arctic-oauth'

export default buildConfig({
  plugins: [
    arcticOAuthPlugin({
      providers: {
        google: googleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      },
    }),
  ],
})
```

Login URL: `GET /api/users/oauth/google`

### With Mobile Support (Expo)

```typescript
// Expo app
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

const login = async () => {
  const redirectUri = Linking.createURL('auth/callback')
  
  const result = await WebBrowser.openAuthSessionAsync(
    `https://your-payload.com/api/users/oauth/google?redirect=${encodeURIComponent(redirectUri)}`,
    redirectUri,
  )
  
  if (result.type === 'success') {
    const url = new URL(result.url)
    const token = url.searchParams.get('token')
    // Store token in SecureStore
  }
}
```

### With Custom User Mapping

```typescript
arcticOAuthPlugin({
  providers: { /* ... */ },
  
  mapUserFields: (userInfo, provider) => ({
    email: userInfo.email,
    displayName: userInfo.name,
    avatar: userInfo.avatarUrl,
    authProvider: provider,
  }),
  
  beforeUserCreate: async ({ userInfo, provider }) => {
    // Custom validation or enrichment
    if (!userInfo.email?.endsWith('@company.com')) {
      throw new Error('Only company emails allowed')
    }
    
    return {
      email: userInfo.email,
      name: userInfo.name,
      department: 'Pending', // Will be updated by admin
    }
  },
  
  afterLogin: async ({ user, provider }) => {
    console.log(`User ${user.email} logged in via ${provider}`)
  },
})
```

### Multiple Providers

```typescript
arcticOAuthPlugin({
  providers: {
    google: googleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    entra: entraProvider({
      clientId: process.env.ENTRA_CLIENT_ID!,
      clientSecret: process.env.ENTRA_CLIENT_SECRET!,
      tenantId: process.env.ENTRA_TENANT_ID!,
    }),
    github: githubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  },
})
```

Available endpoints:
- `GET /api/users/oauth/google`
- `GET /api/users/oauth/entra`
- `GET /api/users/oauth/github`

---

## Security Considerations

1. **PKCE Required**: All providers that support PKCE use it
2. **State Validation**: Prevents CSRF attacks
3. **Short-Lived Cookies**: 10 minute max-age
4. **HttpOnly Cookies**: No JavaScript access
5. **Secure + SameSite**: Modern cookie protections
6. **Clear on Any Callback**: Cookies cleared even on errors
7. **Server-Side Secrets**: Client secrets never exposed

---

## References

- [Arctic Documentation](https://arcticjs.dev/)
- [Arctic GitHub](https://github.com/pilcrowonpaper/arctic)
- [Payload Plugin Development](https://payloadcms.com/docs/plugins/build-your-own)
- [Payload Custom Auth Strategies](https://payloadcms.com/docs/authentication/custom-strategies)