import { Discord } from 'arctic'
import type { OAuth2Tokens } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

/**
 * Discord OAuth provider configuration
 */
export interface DiscordProviderConfig {
  /** OAuth 2.0 Client ID */
  clientId: string
  /** OAuth 2.0 Client Secret */
  clientSecret: string
  /**
   * Additional scopes beyond 'identify' and 'email'
   * @see https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes
   */
  scopes?: string[]
}

/**
 * Discord OAuth provider factory
 *
 * @example
 * ```ts
 * discordProvider({
 *   clientId: process.env.DISCORD_CLIENT_ID!,
 *   clientSecret: process.env.DISCORD_CLIENT_SECRET!,
 * })
 * ```
 */
export function discordProvider(config: DiscordProviderConfig): OAuthProvider {
  return {
    name: 'discord',
    displayName: 'Discord',
    defaultScopes: ['identify', 'email', ...(config.scopes || [])],
    supportsPKCE: false,

    createClient(redirectUri: string) {
      return new Discord(config.clientId, config.clientSecret, redirectUri)
    },

    async getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo> {
      const accessToken = tokens.accessToken()

      const response = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch Discord user info: ${response.status}`)
      }

      const profile = (await response.json()) as {
        id: string
        username: string
        discriminator?: string
        global_name?: string
        email?: string
        verified?: boolean
        avatar?: string | null
      }

      // Build avatar URL if user has a custom avatar
      let avatarUrl: string | undefined
      if (profile.avatar) {
        const format = profile.avatar.startsWith('a_') ? 'gif' : 'png'
        avatarUrl = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`
      }

      // Discord's display name: global_name > username#discriminator > username
      const displayName =
        profile.global_name ||
        (profile.discriminator && profile.discriminator !== '0'
          ? `${profile.username}#${profile.discriminator}`
          : profile.username)

      return {
        providerId: profile.id,
        email: profile.email,
        name: displayName,
        avatarUrl,
        rawClaims: profile,
      }
    },
  }
}
