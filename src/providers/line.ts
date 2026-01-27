import { Line, decodeIdToken } from 'arctic'
import type { OAuth2Tokens } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

/**
 * LINE OAuth provider configuration
 */
export interface LineProviderConfig {
  /** Channel ID */
  clientId: string
  /** Channel Secret */
  clientSecret: string
  /**
   * Additional scopes beyond 'openid', 'profile', and 'email'
   * @see https://developers.line.biz/en/docs/line-login/integrate-line-login/#scopes
   */
  scopes?: string[]
}

/**
 * LINE OAuth provider factory
 *
 * LINE uses OpenID Connect and returns an ID token that can be decoded
 * directly to get user claims.
 *
 * @example
 * ```ts
 * lineProvider({
 *   clientId: process.env.LINE_CLIENT_ID!,
 *   clientSecret: process.env.LINE_CLIENT_SECRET!,
 * })
 * ```
 */
export function lineProvider(config: LineProviderConfig): OAuthProvider {
  return {
    name: 'line',
    displayName: 'LINE',
    defaultScopes: ['openid', 'profile', 'email', ...(config.scopes || [])],
    supportsPKCE: true,

    createClient(redirectUri: string) {
      return new Line(config.clientId, config.clientSecret, redirectUri)
    },

    async getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo> {
      // LINE returns an ID token when 'openid' scope is requested
      // Decode it directly to get user claims (faster than API call)
      const idToken = tokens.idToken()

      if (!idToken) {
        throw new Error('LINE did not return an ID token. Ensure "openid" scope is requested.')
      }

      const claims = decodeIdToken(idToken) as {
        sub: string
        name?: string
        picture?: string
        email?: string
      }

      return {
        providerId: claims.sub,
        email: claims.email,
        name: claims.name,
        avatarUrl: claims.picture,
        rawClaims: claims,
      }
    },
  }
}
