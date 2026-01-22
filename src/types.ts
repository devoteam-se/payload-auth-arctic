import type { CollectionSlug } from 'payload'

/**
 * Microsoft Entra ID configuration
 */
export interface EntraConfig {
  /** Application (client) ID */
  clientId: string
  /** Client secret */
  clientSecret: string
  /**
   * Optional Microsoft Graph fetch configuration
   */
  graph?: {
    /** Fetch group membership from Microsoft Graph */
    groups?: boolean
    /** Fetch user profile from Microsoft Graph */
    profile?: boolean
    /** Fetch directory roles from Microsoft Graph */
    roles?: boolean
  }
  /**
   * Optional scopes to request in addition to defaults
   * (openid, profile, email are always included)
   */
  scopes?: string[]
  /**
   * Skip token signature validation (NOT RECOMMENDED)
   * Only use for development/debugging
   * @default false
   */
  skipSignatureValidation?: boolean
  /** Azure AD Tenant ID (GUID or domain) */
  tenantId: string
}

/**
 * SSO Plugin configuration
 */
export interface SSOPluginConfig {
  /** Auto-create users on first SSO login (default: true) */
  autoProvisionUsers?: boolean
  /** Enable/disable plugin */
  enabled?: boolean
  /** Microsoft Entra ID configuration */
  entra: EntraConfig
  /** URL to redirect on SSO failure (default: '/admin/login?error=sso_failed') */
  failureRedirect?: string
  /** URL to redirect after successful SSO login (default: '/admin') */
  successRedirect?: string
  /** Auth-enabled collection to add SSO to (default: 'users') */
  userCollection?: CollectionSlug
}

/**
 * OIDC claims from ID token
 */
export interface OIDCClaims {
  /** Additional claims */
  [key: string]: unknown
  /** Audience */
  aud?: string
  /** Email address */
  email?: string
  /** Whether email is verified */
  email_verified?: boolean
  /** Token expiry time */
  exp?: number
  /** Family/last name */
  family_name?: string
  /** Given/first name */
  given_name?: string
  /** Token issue time */
  iat?: number
  /** Issuer */
  iss?: string
  /** Full name */
  name?: string
  /** Not before time */
  nbf?: number
  /** Nonce for replay protection */
  nonce?: string
  /** Object ID (Entra) */
  oid?: string
  /** Preferred username */
  preferred_username?: string
  /** Subject identifier */
  sub: string
  /** Tenant ID (Entra) */
  tid?: string
}

/**
 * Token response from OAuth token endpoint
 */
export interface TokenResponse {
  access_token: string
  expires_in: number
  id_token?: string
  refresh_token?: string
  scope?: string
  token_type: string
}

/**
 * State data stored in cookie during OAuth flow
 */
export interface OAuthStateData {
  /** Nonce for token replay protection */
  nonce: string
  /** URL to redirect after successful login */
  returnTo?: string
  /** Random state for CSRF protection */
  state: string
  /** PKCE code verifier */
  verifier: string
}

/**
 * Options for validating ID tokens (Entra-specific)
 */
export interface TokenValidationOptions {
  /** Expected audience (client ID) */
  clientId: string
  /**
   * Clock tolerance in seconds for exp/nbf validation
   * @default 60
   */
  clockTolerance?: number
  /** Expected nonce (optional but recommended) */
  expectedNonce?: string
  /** Expected tenant ID */
  tenantId: string
}
