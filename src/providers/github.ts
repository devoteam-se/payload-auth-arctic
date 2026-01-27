import { GitHub } from 'arctic'
import type { OAuth2Tokens } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

/**
 * GitHub OAuth provider configuration
 */
export interface GitHubProviderConfig {
  /** OAuth App Client ID */
  clientId: string
  /** OAuth App Client Secret */
  clientSecret: string
  /**
   * Additional scopes beyond 'user:email'
   * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
   */
  scopes?: string[]
}

/**
 * GitHub OAuth provider factory
 *
 * @example
 * ```ts
 * githubProvider({
 *   clientId: process.env.GITHUB_CLIENT_ID!,
 *   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
 * })
 * ```
 */
export function githubProvider(config: GitHubProviderConfig): OAuthProvider {
  return {
    name: 'github',
    displayName: 'GitHub',
    defaultScopes: ['user:email', ...(config.scopes || [])],
    supportsPKCE: false,

    createClient(redirectUri: string) {
      return new GitHub(config.clientId, config.clientSecret, redirectUri)
    },

    async getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo> {
      const accessToken = tokens.accessToken()

      // Fetch user profile from GitHub API
      const [userResponse, emailsResponse] = await Promise.all([
        fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }),
        fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }),
      ])

      if (!userResponse.ok) {
        throw new Error(`Failed to fetch GitHub user info: ${userResponse.status}`)
      }

      const profile = (await userResponse.json()) as {
        id: number
        login: string
        name?: string
        email?: string
        avatar_url?: string
      }

      // Get primary email from emails endpoint (more reliable)
      let primaryEmail = profile.email
      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{
          email: string
          primary: boolean
          verified: boolean
        }>
        const primary = emails.find((e) => e.primary && e.verified)
        if (primary) {
          primaryEmail = primary.email
        }
      }

      // Parse name into first/last (best effort)
      let firstName: string | undefined
      let lastName: string | undefined
      if (profile.name) {
        const parts = profile.name.trim().split(/\s+/)
        firstName = parts[0]
        lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined
      }

      return {
        providerId: String(profile.id),
        email: primaryEmail,
        name: profile.name || profile.login,
        firstName,
        lastName,
        avatarUrl: profile.avatar_url,
        rawClaims: profile,
      }
    },
  }
}
