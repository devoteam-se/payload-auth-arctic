import type { CollectionSlug } from 'payload'
import type { OAuth2Tokens } from 'arctic'

/**
 * Standardized user info returned by all OAuth providers
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
 * Arctic client interface - what Arctic providers expose
 * Note: Some providers (like GitHub) don't support PKCE, so codeVerifier is optional
 */
export interface ArcticClient {
  createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL
  validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>
}

/**
 * Arctic client for providers that don't support PKCE (e.g., GitHub)
 */
export interface ArcticClientNoPKCE {
  createAuthorizationURL(state: string, scopes: string[]): URL
  validateAuthorizationCode(code: string): Promise<OAuth2Tokens>
}

/**
 * Base interface all providers implement
 */
export interface OAuthProvider {
  /** Unique identifier for this provider (e.g., 'google', 'entra') */
  name: string

  /**
   * URL slug for OAuth routes (defaults to name)
   * Use this to create multiple instances of the same provider with different slugs
   * @example 'google-staging' for /oauth/google-staging routes
   */
  slug?: string

  /** Display name for UI (e.g., 'Google', 'Microsoft') */
  displayName: string

  /** Default scopes for this provider */
  defaultScopes: string[]

  /** Whether this provider supports PKCE (default: true) */
  supportsPKCE?: boolean

  /** Create the Arctic client instance */
  createClient(redirectUri: string): ArcticClient | ArcticClientNoPKCE

  /** Fetch user info from provider using access token */
  getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo>
}

/**
 * OAuth account linked to a user
 */
export interface OAuthAccount {
  /** Provider identifier (e.g., 'google', 'entra') */
  provider: string
  /** Provider's unique user ID */
  providerId: string
  /** Email from provider (may differ from user's primary email) */
  email?: string
  /** When this account was linked */
  connectedAt: string
}

/**
 * Main plugin configuration
 */
export interface ArcticOAuthPluginConfig {
  /**
   * Array of configured OAuth providers
   * Each provider's slug (or name) is used in URLs: /oauth/{slug}
   */
  providers: OAuthProvider[]

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
   * Enable/disable plugin
   * @default true
   */
  enabled?: boolean

  /**
   * Disable Payload's built-in email/password authentication
   * When true, users can only authenticate via OAuth providers
   * @default false
   */
  disableLocalStrategy?: boolean

  /**
   * Enable mobile app authentication mode (Expo AuthSession, etc.)
   * When enabled, adds support for:
   * - Custom redirect URIs (deep links like myapp://)
   * - Token returned in redirect URL params instead of cookies
   * - CORS headers for mobile app requests
   * @default false
   */
  enableMobileAuth?: boolean

  /**
   * Allowed redirect URI patterns for mobile app mode
   * Supports wildcards: ['myapp://*', 'exp://192.168.*']
   * Only used when enableMobileAuth is true
   * @default []
   */
  allowedMobileRedirectUris?: string[]

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

/**
 * State data stored in cookie during OAuth flow
 */
export interface OAuthStateData {
  /** Random state for CSRF protection */
  state: string
  /** PKCE code verifier */
  codeVerifier: string
  /** Provider key for this OAuth flow */
  provider: string
  /** URL to redirect after successful login */
  returnTo?: string
  /**
   * Mobile app mode - when true, token is returned in redirect URL
   * instead of being set as a cookie
   */
  mobileApp?: boolean
}

/**
 * Provider button info for UI rendering
 */
export interface ProviderButtonInfo {
  /** Provider key (used in URL) */
  key: string
  /** Display name */
  displayName: string
  /** Authorize URL path */
  authorizePath: string
}
