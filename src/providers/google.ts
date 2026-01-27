import { Google } from 'arctic'
import type { OAuth2Tokens } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

/**
 * Google OAuth provider configuration
 */
export interface GoogleProviderConfig {
  /** OAuth 2.0 Client ID */
  clientId: string
  /** OAuth 2.0 Client Secret */
  clientSecret: string
  /**
   * Additional scopes beyond 'openid profile email'
   */
  scopes?: string[]
}

/**
 * Google OAuth provider factory
 *
 * @example
 * ```ts
 * googleProvider({
 *   clientId: process.env.GOOGLE_CLIENT_ID!,
 *   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
 * })
 * ```
 */
export function googleProvider(config: GoogleProviderConfig): OAuthProvider {
  return {
    name: 'google',
    displayName: 'Google',
    defaultScopes: ['openid', 'profile', 'email', ...(config.scopes || [])],

    createClient(redirectUri: string) {
      return new Google(config.clientId, config.clientSecret, redirectUri)
    },

    async getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo> {
      const accessToken = tokens.accessToken()

      // Fetch user profile from Google's userinfo endpoint
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch Google user info: ${response.status}`)
      }

      const profile = (await response.json()) as {
        sub: string
        email?: string
        email_verified?: boolean
        name?: string
        given_name?: string
        family_name?: string
        picture?: string
      }

      return {
        providerId: profile.sub,
        email: profile.email,
        name: profile.name,
        firstName: profile.given_name,
        lastName: profile.family_name,
        avatarUrl: profile.picture,
        rawClaims: profile,
      }
    },
  }
}
