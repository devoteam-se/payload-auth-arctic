# PayloadCMS SSO Plugin - Requirements & Design

A multi-provider SSO plugin for PayloadCMS 3.x, starting with Microsoft Entra ID support and designed for extensibility.

## Executive Summary

This document outlines the design for `payload-plugin-sso`, an open-source alternative to Payload's enterprise SSO offering. The plugin uses Payload 3.x's custom authentication strategies and endpoints to implement OAuth 2.0 / OpenID Connect flows, starting with Microsoft Entra ID and architected for easy addition of other providers.

---

## 1. Landscape Analysis

### Existing Solutions

| Package | Status | Notes |
|---------|--------|-------|
| `payload-oauth2` (WilsonLe) | ✅ Active, v3 compatible | Generic OAuth2, tested with Google/Zitadel/Apple. Has Entra PR merged. Zero deps. |
| `payload-plugin-oauth` (thgh) | ⚠️ v2 only | Passport-based, not updated for v3 |
| `payload-plugin-sso` (thompsonsj) | ⚠️ Unclear status | Fork of thgh's plugin |
| `authsmith/payload-auth-plugin` | ⚠️ Unknown | Limited documentation |
| **Payload Enterprise SSO** | 💰 Paid | Official, handles token refresh, tested with Okta/Azure |

### Why Build Another?

1. **Enterprise focus** - Most existing plugins are generic OAuth2. Enterprise needs SAML support, group/role mapping, and tenant isolation
2. **First-class Entra support** - Specific handling for Entra's quirks (v2.0 endpoints, group overage, tenant isolation)
3. **Plugin architecture** - Designed as a proper Payload plugin with admin UI, not just auth strategy
4. **Provider abstraction** - Clean architecture to add Okta, Auth0, Google Workspace, etc.

---

## 2. Requirements

### Functional Requirements

#### Core Authentication
- [ ] OAuth 2.0 Authorization Code flow with PKCE
- [ ] OpenID Connect support (ID tokens, userinfo endpoint)
- [ ] Session management with Payload's JWT system
- [ ] Automatic user provisioning on first login (JIT provisioning)
- [ ] User account linking (match by email)

#### Provider: Microsoft Entra ID
- [ ] Single-tenant and multi-tenant app support
- [ ] Support for `/v2.0` endpoints
- [ ] Group claims extraction
- [ ] Group overage handling (Microsoft Graph fallback for >200 groups)
- [ ] Tenant ID validation (prevent token from wrong tenant)
- [ ] Custom app roles mapping

#### Admin Experience
- [ ] "Sign in with Microsoft" button on admin login
- [ ] Keep default email/password login available (configurable)
- [ ] Admin UI to view SSO-linked accounts
- [ ] Clear error messages for auth failures

#### Extensibility
- [ ] Provider interface for adding new IdPs
- [ ] Hook system for custom user provisioning
- [ ] Configurable user field mapping
- [ ] Support for multiple providers simultaneously

### Non-Functional Requirements

- Zero external auth dependencies (no Passport.js)
- TypeScript-first with full type safety
- Follows Payload plugin best practices
- Works with all Payload database adapters
- Compatible with Payload's existing access control

---

## 3. Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    PayloadCMS Application                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  payload-plugin-sso                  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │   Plugin    │  │   Auth      │  │  Admin UI  │  │   │
│  │  │   Config    │  │  Strategy   │  │ Components │  │   │
│  │  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  │         │                │                │         │   │
│  │  ┌──────┴────────────────┴────────────────┴──────┐ │   │
│  │  │              Provider Abstraction              │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  │         │                │                │         │   │
│  │  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐ │   │
│  │  │   Entra ID  │  │    Okta     │  │   Google    │ │   │
│  │  │   Provider  │  │  Provider   │  │  Workspace  │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
┌──────┐          ┌─────────┐         ┌────────┐         ┌─────────┐
│ User │          │ Payload │         │ Plugin │         │ Entra   │
└──┬───┘          └────┬────┘         └───┬────┘         └────┬────┘
   │                   │                  │                   │
   │ Click "Sign in    │                  │                   │
   │ with Microsoft"   │                  │                   │
   │──────────────────>│                  │                   │
   │                   │                  │                   │
   │                   │ GET /api/users/  │                   │
   │                   │ sso/entra/auth   │                   │
   │                   │─────────────────>│                   │
   │                   │                  │                   │
   │                   │                  │ Generate PKCE     │
   │                   │                  │ Store state/verifier
   │                   │                  │                   │
   │                   │  302 Redirect    │                   │
   │<──────────────────│<─────────────────│                   │
   │                   │                  │                   │
   │ Redirect to Entra │                  │                   │
   │────────────────────────────────────────────────────────>│
   │                   │                  │                   │
   │                   │                  │   User logs in    │
   │<────────────────────────────────────────────────────────│
   │                   │                  │   (with code)     │
   │                   │                  │                   │
   │ GET /api/users/   │                  │                   │
   │ sso/entra/callback│                  │                   │
   │ ?code=xxx&state=yyy                  │                   │
   │──────────────────>│                  │                   │
   │                   │─────────────────>│                   │
   │                   │                  │                   │
   │                   │                  │ POST /token       │
   │                   │                  │─────────────────>│
   │                   │                  │                   │
   │                   │                  │ {access_token,    │
   │                   │                  │  id_token, ...}   │
   │                   │                  │<─────────────────│
   │                   │                  │                   │
   │                   │                  │ Validate tokens   │
   │                   │                  │ Extract claims    │
   │                   │                  │ Find/create user  │
   │                   │                  │                   │
   │                   │  Set JWT cookie  │                   │
   │<──────────────────│<─────────────────│                   │
   │                   │  Redirect /admin │                   │
   │                   │                  │                   │
```

---

## 4. Plugin Structure

```
payload-plugin-sso/
├── package.json
├── tsconfig.json
├── .swcrc
├── README.md
├── LICENSE
│
├── src/
│   ├── index.ts                    # Main export
│   ├── plugin.ts                   # Plugin function
│   ├── types.ts                    # Public types
│   ├── defaults.ts                 # Default configuration
│   │
│   ├── providers/
│   │   ├── index.ts                # Provider registry
│   │   ├── types.ts                # Provider interface
│   │   ├── base.ts                 # Base provider class
│   │   │
│   │   ├── entra/
│   │   │   ├── index.ts            # Entra provider
│   │   │   ├── types.ts            # Entra-specific types
│   │   │   ├── endpoints.ts        # Auth & callback endpoints
│   │   │   ├── strategy.ts         # Auth strategy
│   │   │   ├── tokens.ts           # Token validation
│   │   │   └── graph.ts            # Microsoft Graph client
│   │   │
│   │   └── okta/                   # Future: Okta provider
│   │       └── ...
│   │
│   ├── lib/
│   │   ├── pkce.ts                 # PKCE utilities
│   │   ├── state.ts                # State management
│   │   ├── jwt.ts                  # JWT utilities
│   │   └── crypto.ts               # Crypto helpers
│   │
│   ├── components/
│   │   ├── SSOLoginButton.tsx      # 'use client' login button
│   │   └── AfterLogin.tsx          # Injected after login form
│   │
│   ├── fields/
│   │   └── sso-identity/           # SSO identity field group
│   │       ├── index.ts
│   │       └── Component.tsx
│   │
│   └── exports/
│       ├── client.ts               # Client component exports
│       └── types.ts                # Type-only exports
│
└── dev/                            # Development environment
    ├── payload.config.ts
    ├── .env.example
    └── int.spec.ts
```

---

## 5. Type Definitions

### Plugin Configuration

```typescript
// src/types.ts

import type { CollectionSlug } from 'payload'

/**
 * Provider-agnostic base configuration
 */
export interface SSOProviderConfig {
  /** Unique identifier for this provider instance */
  name: string
  /** Display name shown in UI */
  displayName?: string
  /** Button label for login UI */
  buttonLabel?: string
  /** Path prefix for endpoints (default: provider name) */
  pathPrefix?: string
}

/**
 * Microsoft Entra ID specific configuration
 */
export interface EntraProviderConfig extends SSOProviderConfig {
  provider: 'entra'
  /** Azure AD Tenant ID (GUID or domain) */
  tenantId: string
  /** Application (client) ID */
  clientId: string
  /** Client secret (for confidential clients) */
  clientSecret: string
  /** 
   * OAuth scopes to request
   * @default ['openid', 'profile', 'email'] 
   */
  scopes?: string[]
  /**
   * Enable group claims
   * Requires 'GroupMember.Read.All' scope for overage handling
   */
  enableGroups?: boolean
  /**
   * Map Entra group IDs to Payload roles
   * @example { 'abc-123': 'admin', 'def-456': 'editor' }
   */
  groupRoleMapping?: Record<string, string>
  /**
   * Allow only users from specific groups
   */
  allowedGroups?: string[]
}

// Future providers
export interface OktaProviderConfig extends SSOProviderConfig {
  provider: 'okta'
  domain: string
  clientId: string
  clientSecret: string
  // ... okta-specific options
}

export interface GoogleWorkspaceConfig extends SSOProviderConfig {
  provider: 'google-workspace'
  domain: string
  clientId: string
  clientSecret: string
  // ... google-specific options
}

export type ProviderConfig = 
  | EntraProviderConfig 
  | OktaProviderConfig 
  | GoogleWorkspaceConfig

/**
 * User field mapping configuration
 */
export interface UserFieldMapping {
  /** Field to store email (default: 'email') */
  email?: string
  /** Field to store display name */
  name?: string
  /** Field to store first name */
  firstName?: string
  /** Field to store last name */
  lastName?: string
  /** Field to store roles/groups */
  roles?: string
  /** Custom field mapping function */
  custom?: (claims: OIDCClaims) => Record<string, unknown>
}

/**
 * Main plugin configuration
 */
export interface SSOPluginConfig {
  /** Enable/disable plugin (keeps schema for migrations) */
  enabled?: boolean
  
  /** Auth-enabled collection to add SSO to (default: 'users') */
  userCollection?: CollectionSlug
  
  /** Configured SSO providers */
  providers: ProviderConfig[]
  
  /** 
   * Disable default email/password login
   * @default false 
   */
  disableLocalStrategy?: boolean
  
  /**
   * URL to redirect after successful SSO login
   * @default '/admin'
   */
  successRedirect?: string
  
  /**
   * URL to redirect on SSO failure
   * @default '/admin/login?error=sso_failed'
   */
  failureRedirect?: string
  
  /**
   * User field mapping
   */
  userFields?: UserFieldMapping
  
  /**
   * Auto-create users on first SSO login
   * @default true
   */
  autoProvisionUsers?: boolean
  
  /**
   * Hook called before user creation
   * Return modified data or null to reject
   */
  beforeUserCreate?: (args: {
    claims: OIDCClaims
    provider: string
    data: Record<string, unknown>
  }) => Promise<Record<string, unknown> | null>
  
  /**
   * Hook called after successful SSO authentication
   */
  afterSSOLogin?: (args: {
    user: Record<string, unknown>
    claims: OIDCClaims
    provider: string
    req: PayloadRequest
  }) => Promise<void>
  
  /**
   * Add SSO tab to user collection admin UI
   * @default true
   */
  tabbedUI?: boolean
}

/**
 * Standard OIDC claims
 */
export interface OIDCClaims {
  sub: string           // Subject identifier
  email?: string
  email_verified?: boolean
  name?: string
  given_name?: string
  family_name?: string
  preferred_username?: string
  picture?: string
  groups?: string[]     // Group memberships (if enabled)
  roles?: string[]      // App roles (Entra)
  tid?: string          // Tenant ID (Entra)
  oid?: string          // Object ID (Entra)
  [key: string]: unknown
}
```

### Provider Interface

```typescript
// src/providers/types.ts

import type { Endpoint, Strategy, PayloadRequest } from 'payload'

export interface TokenResponse {
  access_token: string
  id_token?: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

export interface SSOProvider {
  /** Provider identifier */
  readonly name: string
  
  /** Human-readable name */
  readonly displayName: string
  
  /**
   * Generate authorization URL
   */
  getAuthorizationUrl(args: {
    redirectUri: string
    state: string
    codeVerifier: string
    scopes?: string[]
  }): Promise<string>
  
  /**
   * Exchange authorization code for tokens
   */
  exchangeCode(args: {
    code: string
    redirectUri: string
    codeVerifier: string
  }): Promise<TokenResponse>
  
  /**
   * Validate and decode ID token
   */
  validateIdToken(idToken: string): Promise<OIDCClaims>
  
  /**
   * Get user info from userinfo endpoint (optional)
   */
  getUserInfo?(accessToken: string): Promise<OIDCClaims>
  
  /**
   * Get user's groups (if supported)
   */
  getGroups?(accessToken: string, claims: OIDCClaims): Promise<string[]>
  
  /**
   * Create Payload endpoints for this provider
   */
  createEndpoints(pluginConfig: SSOPluginConfig): Endpoint[]
  
  /**
   * Create Payload auth strategy for this provider
   */
  createStrategy(pluginConfig: SSOPluginConfig): Strategy
}
```

---

## 6. Core Implementation Details

### Plugin Entry Point

```typescript
// src/plugin.ts

import type { Config, Plugin } from 'payload'
import type { SSOPluginConfig } from './types'
import { createProvider } from './providers'
import { ssoIdentityFields } from './fields/sso-identity'
import { defaults } from './defaults'

export const ssoPlugin = (pluginConfig: SSOPluginConfig): Plugin => 
  (config: Config): Config => {
    const options = { ...defaults, ...pluginConfig }
    const userCollectionSlug = options.userCollection || 'users'
    
    // Initialize providers
    const providers = options.providers.map(providerConfig => 
      createProvider(providerConfig)
    )
    
    // Collect endpoints from all providers
    const ssoEndpoints = providers.flatMap(provider => 
      provider.createEndpoints(options)
    )
    
    // Collect strategies from all providers
    const ssoStrategies = providers.map(provider => 
      provider.createStrategy(options)
    )
    
    // Modify user collection
    const collections = (config.collections || []).map(collection => {
      if (collection.slug !== userCollectionSlug) return collection
      
      return {
        ...collection,
        auth: {
          ...(typeof collection.auth === 'object' ? collection.auth : {}),
          disableLocalStrategy: options.disableLocalStrategy,
          strategies: [
            ...((typeof collection.auth === 'object' 
              ? collection.auth.strategies 
              : []) || []),
            ...ssoStrategies,
          ],
        },
        endpoints: [
          ...(collection.endpoints || []),
          ...ssoEndpoints,
        ],
        fields: [
          ...(collection.fields || []),
          ...ssoIdentityFields(options),
        ],
        // Add SSO tab if tabbedUI enabled
        ...(options.tabbedUI && {
          admin: {
            ...collection.admin,
            components: {
              ...collection.admin?.components,
              // Component path for admin UI injection
            },
          },
        }),
      }
    })
    
    // Add AfterLogin component to admin
    const adminComponents = config.admin?.components || {}
    
    return {
      ...config,
      collections,
      admin: {
        ...config.admin,
        components: {
          ...adminComponents,
          afterLogin: [
            ...(adminComponents.afterLogin || []),
            // Path to SSO login buttons component
          ],
        },
      },
    }
  }
```

### Entra ID Provider

```typescript
// src/providers/entra/index.ts

import type { SSOProvider, TokenResponse, OIDCClaims } from '../types'
import type { EntraProviderConfig, SSOPluginConfig } from '../../types'
import type { Endpoint, Strategy, PayloadRequest } from 'payload'
import { generatePKCE, generateState } from '../../lib/pkce'
import { validateJWT, getJWKS } from './tokens'

export class EntraProvider implements SSOProvider {
  readonly name: string
  readonly displayName: string
  private config: EntraProviderConfig
  
  // Entra v2.0 endpoints
  private readonly baseUrl: string
  private readonly authorizeUrl: string
  private readonly tokenUrl: string
  private readonly jwksUrl: string
  private readonly graphUrl = 'https://graph.microsoft.com/v1.0'
  
  constructor(config: EntraProviderConfig) {
    this.config = config
    this.name = config.name || 'entra'
    this.displayName = config.displayName || 'Microsoft'
    
    // Build tenant-specific URLs
    const tenant = config.tenantId
    this.baseUrl = `https://login.microsoftonline.com/${tenant}`
    this.authorizeUrl = `${this.baseUrl}/oauth2/v2.0/authorize`
    this.tokenUrl = `${this.baseUrl}/oauth2/v2.0/token`
    this.jwksUrl = `${this.baseUrl}/discovery/v2.0/keys`
  }
  
  async getAuthorizationUrl(args: {
    redirectUri: string
    state: string
    codeVerifier: string
    scopes?: string[]
  }): Promise<string> {
    const { redirectUri, state, codeVerifier, scopes } = args
    
    // Generate code challenge from verifier
    const codeChallenge = await this.generateCodeChallenge(codeVerifier)
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: (scopes || this.config.scopes || ['openid', 'profile', 'email']).join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      // Prompt for account selection if multiple accounts
      prompt: 'select_account',
    })
    
    return `${this.authorizeUrl}?${params.toString()}`
  }
  
  async exchangeCode(args: {
    code: string
    redirectUri: string
    codeVerifier: string
  }): Promise<TokenResponse> {
    const { code, redirectUri, codeVerifier } = args
    
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`)
    }
    
    return response.json()
  }
  
  async validateIdToken(idToken: string): Promise<OIDCClaims> {
    // Fetch JWKS and validate token signature
    const jwks = await getJWKS(this.jwksUrl)
    const claims = await validateJWT(idToken, jwks, {
      issuer: `${this.baseUrl}/v2.0`,
      audience: this.config.clientId,
    })
    
    // Validate tenant ID if configured
    if (claims.tid !== this.config.tenantId) {
      throw new Error('Token tenant ID mismatch')
    }
    
    return claims
  }
  
  async getGroups(accessToken: string, claims: OIDCClaims): Promise<string[]> {
    // If groups claim exists and isn't overage indicator
    if (claims.groups && Array.isArray(claims.groups)) {
      return claims.groups
    }
    
    // Check for group overage indicator
    if (claims._claim_names?.groups) {
      // Fetch groups from Microsoft Graph
      return this.fetchGroupsFromGraph(accessToken)
    }
    
    return []
  }
  
  private async fetchGroupsFromGraph(accessToken: string): Promise<string[]> {
    const response = await fetch(
      `${this.graphUrl}/me/transitiveMemberOf/microsoft.graph.group?$select=id`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
    
    if (!response.ok) {
      console.warn('Failed to fetch groups from Graph API')
      return []
    }
    
    const data = await response.json()
    return data.value.map((group: { id: string }) => group.id)
  }
  
  createEndpoints(pluginConfig: SSOPluginConfig): Endpoint[] {
    const pathPrefix = this.config.pathPrefix || this.name
    
    return [
      // Authorization endpoint
      {
        path: `/sso/${pathPrefix}/authorize`,
        method: 'get',
        handler: async (req: PayloadRequest) => {
          const { codeVerifier, codeChallenge } = await generatePKCE()
          const state = generateState()
          
          // Store state and verifier (use server-side session/cookie)
          // This is critical for security
          const stateData = {
            verifier: codeVerifier,
            provider: this.name,
            returnTo: req.query?.returnTo || pluginConfig.successRedirect,
          }
          
          // Set encrypted cookie with state data
          const stateCookie = await this.encryptState(stateData)
          
          const redirectUri = this.getRedirectUri(req)
          const authUrl = await this.getAuthorizationUrl({
            redirectUri,
            state,
            codeVerifier,
          })
          
          return new Response(null, {
            status: 302,
            headers: {
              Location: authUrl,
              'Set-Cookie': `sso_state=${stateCookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
            },
          })
        },
      },
      
      // Callback endpoint
      {
        path: `/sso/${pathPrefix}/callback`,
        method: 'get',
        handler: async (req: PayloadRequest) => {
          try {
            const { code, state, error } = req.query || {}
            
            if (error) {
              throw new Error(`OAuth error: ${error}`)
            }
            
            if (!code || !state) {
              throw new Error('Missing code or state parameter')
            }
            
            // Retrieve and validate state
            const stateCookie = req.headers.get('cookie')?.match(/sso_state=([^;]+)/)?.[1]
            if (!stateCookie) {
              throw new Error('Missing state cookie')
            }
            
            const stateData = await this.decryptState(stateCookie)
            
            // Exchange code for tokens
            const redirectUri = this.getRedirectUri(req)
            const tokens = await this.exchangeCode({
              code: code as string,
              redirectUri,
              codeVerifier: stateData.verifier,
            })
            
            // Validate ID token and extract claims
            const claims = await this.validateIdToken(tokens.id_token!)
            
            // Get groups if enabled
            let groups: string[] = []
            if (this.config.enableGroups) {
              groups = await this.getGroups(tokens.access_token, claims)
            }
            
            // Find or create user
            const user = await this.findOrCreateUser(req.payload, claims, groups, pluginConfig)
            
            if (!user) {
              throw new Error('User provisioning failed or rejected')
            }
            
            // Generate Payload JWT
            const payloadToken = await req.payload.auth.generateToken({
              collection: pluginConfig.userCollection || 'users',
              user,
            })
            
            // Set JWT cookie and redirect
            const cookiePrefix = req.payload.config.cookiePrefix || 'payload'
            
            return new Response(null, {
              status: 302,
              headers: {
                Location: stateData.returnTo || pluginConfig.successRedirect || '/admin',
                'Set-Cookie': [
                  `${cookiePrefix}-token=${payloadToken}; HttpOnly; Secure; SameSite=Lax; Path=/`,
                  `sso_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
                ].join(', '),
              },
            })
            
          } catch (error) {
            console.error('SSO callback error:', error)
            const failureUrl = new URL(
              pluginConfig.failureRedirect || '/admin/login',
              req.url
            )
            failureUrl.searchParams.set('error', 'sso_failed')
            failureUrl.searchParams.set('message', (error as Error).message)
            
            return new Response(null, {
              status: 302,
              headers: {
                Location: failureUrl.toString(),
                'Set-Cookie': `sso_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
              },
            })
          }
        },
      },
    ]
  }
  
  createStrategy(pluginConfig: SSOPluginConfig): Strategy {
    return {
      name: `sso-${this.name}`,
      authenticate: async ({ payload, headers }) => {
        // This strategy validates existing sessions
        // The actual login flow uses the endpoints above
        // Strategy is used when a request comes in with a valid JWT
        // to verify the user still exists and is allowed
        return { user: null }
      },
    }
  }
  
  private async findOrCreateUser(
    payload: Payload,
    claims: OIDCClaims,
    groups: string[],
    pluginConfig: SSOPluginConfig
  ) {
    const userCollection = pluginConfig.userCollection || 'users'
    const emailField = pluginConfig.userFields?.email || 'email'
    
    // Try to find existing user by email or SSO identity
    const existingUsers = await payload.find({
      collection: userCollection,
      where: {
        or: [
          { [emailField]: { equals: claims.email } },
          { 'ssoIdentities.providerUserId': { equals: claims.sub } },
        ],
      },
      limit: 1,
    })
    
    if (existingUsers.docs.length > 0) {
      const user = existingUsers.docs[0]
      
      // Update SSO identity if needed
      await this.updateUserSSOIdentity(payload, user, claims, groups, pluginConfig)
      
      return user
    }
    
    // Auto-provision new user
    if (!pluginConfig.autoProvisionUsers) {
      return null
    }
    
    // Map claims to user fields
    let userData: Record<string, unknown> = {
      [emailField]: claims.email,
      [pluginConfig.userFields?.name || 'name']: claims.name,
      ssoIdentities: [{
        provider: this.name,
        providerUserId: claims.sub,
        providerEmail: claims.email,
        lastLogin: new Date().toISOString(),
      }],
    }
    
    // Map groups to roles
    if (this.config.groupRoleMapping && groups.length > 0) {
      const roles = groups
        .map(g => this.config.groupRoleMapping![g])
        .filter(Boolean)
      if (roles.length > 0) {
        userData[pluginConfig.userFields?.roles || 'roles'] = roles
      }
    }
    
    // Apply custom mapping
    if (pluginConfig.userFields?.custom) {
      userData = {
        ...userData,
        ...pluginConfig.userFields.custom(claims),
      }
    }
    
    // Call beforeUserCreate hook
    if (pluginConfig.beforeUserCreate) {
      const result = await pluginConfig.beforeUserCreate({
        claims,
        provider: this.name,
        data: userData,
      })
      if (result === null) return null
      userData = result
    }
    
    // Create user
    return payload.create({
      collection: userCollection,
      data: userData,
    })
  }
  
  // ... helper methods
}
```

### SSO Identity Fields

```typescript
// src/fields/sso-identity/index.ts

import type { Field, GroupField, ArrayField } from 'payload'
import type { SSOPluginConfig } from '../../types'

export const ssoIdentityFields = (config: SSOPluginConfig): Field[] => {
  const ssoIdentitiesField: ArrayField = {
    name: 'ssoIdentities',
    type: 'array',
    admin: {
      readOnly: true,
      condition: (data) => data?.ssoIdentities?.length > 0,
    },
    fields: [
      {
        name: 'provider',
        type: 'text',
        required: true,
        admin: { readOnly: true },
      },
      {
        name: 'providerUserId',
        type: 'text',
        required: true,
        admin: { readOnly: true },
      },
      {
        name: 'providerEmail',
        type: 'email',
        admin: { readOnly: true },
      },
      {
        name: 'lastLogin',
        type: 'date',
        admin: { readOnly: true },
      },
      {
        name: 'groups',
        type: 'json',
        admin: { readOnly: true },
      },
    ],
  }
  
  return [ssoIdentitiesField]
}
```

---

## 7. Admin UI Components

### SSO Login Buttons

```tsx
// src/components/AfterLogin.tsx
'use client'

import { useState } from 'react'
import { useConfig } from '@payloadcms/ui'

interface SSOButtonProps {
  provider: {
    name: string
    displayName: string
    buttonLabel?: string
  }
}

const SSOButton = ({ provider }: SSOButtonProps) => {
  const [loading, setLoading] = useState(false)
  
  const handleClick = () => {
    setLoading(true)
    // Redirect to SSO auth endpoint
    window.location.href = `/api/users/sso/${provider.name}/authorize`
  }
  
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="sso-login-button"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: '100%',
        padding: '12px 16px',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 'var(--style-radius-s)',
        background: 'var(--theme-elevation-50)',
        cursor: loading ? 'wait' : 'pointer',
        marginTop: '16px',
      }}
    >
      {loading ? (
        'Redirecting...'
      ) : (
        provider.buttonLabel || `Sign in with ${provider.displayName}`
      )}
    </button>
  )
}

export const AfterLogin = () => {
  // Providers would be passed via custom provider context
  // or fetched from an endpoint
  const providers = [
    { name: 'entra', displayName: 'Microsoft', buttonLabel: 'Sign in with Microsoft' },
  ]
  
  return (
    <div className="sso-login-buttons">
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        margin: '16px 0',
        color: 'var(--theme-elevation-400)',
      }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--theme-elevation-150)' }} />
        <span style={{ padding: '0 16px', fontSize: '12px' }}>or</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--theme-elevation-150)' }} />
      </div>
      
      {providers.map(provider => (
        <SSOButton key={provider.name} provider={provider} />
      ))}
    </div>
  )
}
```

---

## 8. Security Considerations

### Critical Security Requirements

1. **PKCE (Proof Key for Code Exchange)**
   - Always use S256 code challenge method
   - Generate cryptographically secure code verifiers (43-128 chars)
   - Never expose code verifier to client

2. **State Parameter**
   - Cryptographically random state value
   - Server-side validation to prevent CSRF
   - Include provider and return URL in encrypted state cookie

3. **Token Validation**
   - Validate JWT signature using provider's JWKS
   - Verify issuer (`iss`) matches expected URL
   - Verify audience (`aud`) matches client ID
   - Verify token is not expired (`exp`)
   - Validate tenant ID for multi-tenant apps

4. **Secure Cookie Handling**
   - `HttpOnly` flag to prevent XSS
   - `Secure` flag for HTTPS only
   - `SameSite=Lax` to prevent CSRF
   - Short TTL for state cookies (10 min max)

5. **Group/Role Mapping**
   - Validate group IDs are expected format (GUIDs for Entra)
   - Never trust client-provided group claims
   - Always verify via server-side API call when critical

### Implementation Checklist

- [ ] PKCE implementation with S256
- [ ] Secure random state generation
- [ ] Encrypted state cookie storage
- [ ] JWT signature validation with JWKS
- [ ] Issuer/audience/expiry validation
- [ ] Tenant ID verification
- [ ] HTTPS enforcement
- [ ] Cookie security flags
- [ ] Rate limiting on auth endpoints
- [ ] Audit logging for SSO events

---

## 9. Configuration Examples

### Minimal Entra Setup

```typescript
// payload.config.ts
import { buildConfig } from 'payload'
import { ssoPlugin } from 'payload-plugin-sso'

export default buildConfig({
  plugins: [
    ssoPlugin({
      providers: [
        {
          provider: 'entra',
          name: 'entra',
          tenantId: process.env.AZURE_TENANT_ID!,
          clientId: process.env.AZURE_CLIENT_ID!,
          clientSecret: process.env.AZURE_CLIENT_SECRET!,
        },
      ],
    }),
  ],
  // ...
})
```

### Full Configuration

```typescript
ssoPlugin({
  enabled: true,
  userCollection: 'users',
  disableLocalStrategy: false, // Keep password login
  successRedirect: '/admin',
  failureRedirect: '/admin/login?error=sso',
  autoProvisionUsers: true,
  tabbedUI: true,
  
  providers: [
    {
      provider: 'entra',
      name: 'corporate',
      displayName: 'Corporate SSO',
      buttonLabel: 'Sign in with Corporate Account',
      tenantId: process.env.AZURE_TENANT_ID!,
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      scopes: ['openid', 'profile', 'email', 'User.Read', 'GroupMember.Read.All'],
      enableGroups: true,
      groupRoleMapping: {
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': 'admin',
        'ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj': 'editor',
      },
      allowedGroups: [
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj',
      ],
    },
  ],
  
  userFields: {
    email: 'email',
    name: 'fullName',
    roles: 'roles',
    custom: (claims) => ({
      department: claims.department,
      employeeId: claims.employee_id,
    }),
  },
  
  beforeUserCreate: async ({ claims, provider, data }) => {
    // Validate user is in allowed domain
    if (!claims.email?.endsWith('@company.com')) {
      return null // Reject user
    }
    return data
  },
  
  afterSSOLogin: async ({ user, claims, provider, req }) => {
    // Audit log
    await req.payload.create({
      collection: 'audit-logs',
      data: {
        action: 'sso_login',
        userId: user.id,
        provider,
        ip: req.headers.get('x-forwarded-for'),
      },
    })
  },
})
```

---

## 10. Azure Portal Setup Guide

### App Registration Steps

1. **Create App Registration**
   - Go to Azure Portal → Microsoft Entra ID → App registrations
   - Click "New registration"
   - Name: Your app name (e.g., "PayloadCMS SSO")
   - Supported account types: "Accounts in this organizational directory only"
   - Redirect URI: `https://your-domain.com/api/users/sso/entra/callback`

2. **Configure Authentication**
   - Add redirect URIs for all environments (dev, staging, prod)
   - Enable "ID tokens" under Implicit grant
   - Ensure redirect URIs use HTTPS (except localhost)

3. **Create Client Secret**
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Copy value immediately (shown only once)
   - Set appropriate expiry and create rotation process

4. **Configure API Permissions** (if using groups)
   - Go to "API permissions"
   - Add: Microsoft Graph → Delegated → `User.Read`
   - Add: Microsoft Graph → Delegated → `GroupMember.Read.All`
   - Grant admin consent if required

5. **Enable Group Claims** (optional)
   - Go to "Token configuration"
   - Click "Add groups claim"
   - Select "Security groups" or "Groups assigned to the application"
   - For tokens: Select "Group ID"

6. **Note Required Values**
   - Application (client) ID: `AZURE_CLIENT_ID`
   - Directory (tenant) ID: `AZURE_TENANT_ID`
   - Client secret value: `AZURE_CLIENT_SECRET`

---

## 11. Testing Strategy

### Unit Tests

```typescript
// Test PKCE generation
describe('PKCE', () => {
  it('generates valid code verifier', () => {
    const verifier = generateCodeVerifier()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
  })
  
  it('generates valid code challenge', async () => {
    const verifier = 'test-verifier'
    const challenge = await generateCodeChallenge(verifier)
    expect(challenge).toBeDefined()
    // Verify S256 hash
  })
})

// Test token validation
describe('Token Validation', () => {
  it('rejects expired tokens', async () => {
    const expiredToken = createTestToken({ exp: Date.now() / 1000 - 3600 })
    await expect(validateIdToken(expiredToken)).rejects.toThrow('expired')
  })
  
  it('rejects wrong audience', async () => {
    const wrongAudienceToken = createTestToken({ aud: 'wrong-client-id' })
    await expect(validateIdToken(wrongAudienceToken)).rejects.toThrow('audience')
  })
})
```

### Integration Tests

```typescript
// Test full auth flow
describe('SSO Flow', () => {
  it('redirects to authorization endpoint', async () => {
    const response = await fetch('/api/users/sso/entra/authorize')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('login.microsoftonline.com')
  })
  
  it('handles callback and creates user', async () => {
    // Mock token exchange
    // Verify user creation
    // Verify JWT cookie set
  })
})
```

---

## 12. Future Providers Roadmap

### Phase 1: Entra ID (Current)
- OAuth 2.0 + OIDC
- Group claims & overage
- Role mapping

### Phase 2: Okta
- Similar OIDC flow
- Okta-specific group handling
- Universal Directory integration

### Phase 3: Google Workspace
- Google-specific OIDC
- Domain restriction
- Google Groups integration

### Phase 4: Generic OIDC
- Self-hosted IdPs (Keycloak, Authentik)
- Any OIDC-compliant provider

### Phase 5: SAML 2.0
- Enterprise SAML support
- SP-initiated SSO
- Attribute mapping

---

## 13. Dependencies & Compatibility

### Package Dependencies

```json
{
  "peerDependencies": {
    "payload": "^3.0.0"
  },
  "dependencies": {
    // Zero external auth dependencies
    // Only Payload's built-in crypto via Node.js
  }
}
```

### Compatibility Matrix

| PayloadCMS | Plugin Version | Node.js |
|------------|----------------|---------|
| 3.x        | 1.x            | ≥18.x   |

---

## 14. Getting Started Checklist

1. [ ] Initialize plugin from template: `npx create-payload-app@latest --template plugin`
2. [ ] Define type interfaces in `src/types.ts`
3. [ ] Implement base provider class and interface
4. [ ] Implement Entra provider with PKCE flow
5. [ ] Add SSO identity fields to user collection
6. [ ] Create admin UI login button component
7. [ ] Write integration tests with mock IdP
8. [ ] Document Azure Portal setup steps
9. [ ] Publish to npm as `payload-plugin-sso`