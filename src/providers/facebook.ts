import { Facebook } from 'arctic'
import type { OAuth2Tokens } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

/**
 * Facebook OAuth provider configuration
 */
export interface FacebookProviderConfig {
  /** OAuth App ID */
  clientId: string
  /** OAuth App Secret */
  clientSecret: string
  /**
   * Additional scopes beyond 'email' and 'public_profile'
   * @see https://developers.facebook.com/docs/permissions/reference
   */
  scopes?: string[]
}

/**
 * Facebook OAuth provider factory
 *
 * @example
 * ```ts
 * facebookProvider({
 *   clientId: process.env.FACEBOOK_CLIENT_ID!,
 *   clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
 * })
 * ```
 */
export function facebookProvider(config: FacebookProviderConfig): OAuthProvider {
  return {
    name: 'facebook',
    displayName: 'Facebook',
    defaultScopes: ['email', 'public_profile', ...(config.scopes || [])],
    supportsPKCE: false,

    createClient(redirectUri: string) {
      return new Facebook(config.clientId, config.clientSecret, redirectUri)
    },

    async getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo> {
      const accessToken = tokens.accessToken()

      // Facebook uses query params for access token, not Authorization header
      const url = new URL('https://graph.facebook.com/me')
      url.searchParams.set('access_token', accessToken)
      url.searchParams.set('fields', 'id,name,email,picture.type(large),first_name,last_name')

      const response = await fetch(url.toString())

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to fetch Facebook user info: ${response.status} - ${error}`)
      }

      const profile = (await response.json()) as {
        id: string
        name?: string
        email?: string
        first_name?: string
        last_name?: string
        picture?: {
          data?: {
            url?: string
          }
        }
      }

      return {
        providerId: profile.id,
        email: profile.email,
        name: profile.name,
        firstName: profile.first_name,
        lastName: profile.last_name,
        avatarUrl: profile.picture?.data?.url,
        rawClaims: profile,
      }
    },
  }
}
