import { Apple } from 'arctic'
import type { OAuth2Tokens } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

/**
 * Apple Sign In provider configuration
 */
export interface AppleProviderConfig {
  /** Apple Services ID (Client ID) */
  clientId: string
  /** Apple Team ID */
  teamId: string
  /** Apple Key ID */
  keyId: string
  /**
   * Apple private key (.p8 file contents)
   * The private key used to sign the client secret JWT
   */
  privateKey: string
  /**
   * Additional scopes beyond 'name email'
   * Note: Apple only supports 'name' and 'email' scopes
   */
  scopes?: string[]
}

/**
 * Apple Sign In provider factory
 *
 * @example
 * ```ts
 * appleProvider({
 *   clientId: process.env.APPLE_CLIENT_ID!,
 *   teamId: process.env.APPLE_TEAM_ID!,
 *   keyId: process.env.APPLE_KEY_ID!,
 *   privateKey: process.env.APPLE_PRIVATE_KEY!,
 * })
 * ```
 */
export function appleProvider(config: AppleProviderConfig): OAuthProvider {
  return {
    name: 'apple',
    displayName: 'Apple',
    defaultScopes: ['name', 'email', ...(config.scopes || [])],

    createClient(redirectUri: string) {
      // Arctic expects the private key as a Uint8Array
      const privateKeyBytes = new TextEncoder().encode(config.privateKey)
      return new Apple(config.clientId, config.teamId, config.keyId, privateKeyBytes, redirectUri)
    },

    async getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo> {
      // Apple returns user info in the ID token, not via an API endpoint
      // The ID token is a JWT that contains the user's information
      const idToken = tokens.idToken()

      if (!idToken) {
        throw new Error('Apple did not return an ID token')
      }

      // Decode the JWT payload (without verification - Arctic already verified it)
      const parts = idToken.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid Apple ID token format')
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as {
        sub: string
        email?: string
        email_verified?: string | boolean
        is_private_email?: string | boolean
      }

      // Note: Apple only sends the user's name on the FIRST authorization
      // After that, you must store it because Apple won't send it again
      // The name comes from the `user` POST parameter, not the ID token
      // This is handled at the callback route level

      return {
        providerId: payload.sub,
        email: payload.email,
        // Apple doesn't include name in the ID token
        // Name is only available on first auth via POST body
        name: undefined,
        firstName: undefined,
        lastName: undefined,
        avatarUrl: undefined,
        rawClaims: payload,
      }
    },
  }
}
