import { MicrosoftEntraId } from 'arctic'
import type { OAuth2Tokens } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

/**
 * Microsoft Entra ID (Azure AD) provider configuration
 */
export interface EntraProviderConfig {
  /** Application (client) ID */
  clientId: string
  /** Client secret */
  clientSecret: string
  /** Azure AD Tenant ID (GUID or domain) */
  tenantId: string
  /**
   * Additional scopes beyond 'openid profile email'
   * Note: 'User.Read' is always included for MS Graph profile fetch
   */
  scopes?: string[]
}

/**
 * Microsoft Entra ID OAuth provider factory
 *
 * @example
 * ```ts
 * entraProvider({
 *   clientId: process.env.ENTRA_CLIENT_ID!,
 *   clientSecret: process.env.ENTRA_CLIENT_SECRET!,
 *   tenantId: process.env.ENTRA_TENANT_ID!,
 * })
 * ```
 */
export function entraProvider(config: EntraProviderConfig): OAuthProvider {
  return {
    name: 'entra',
    displayName: 'Microsoft',
    defaultScopes: ['openid', 'profile', 'email', 'User.Read', ...(config.scopes || [])],

    createClient(redirectUri: string) {
      return new MicrosoftEntraId(
        config.tenantId,
        config.clientId,
        config.clientSecret,
        redirectUri,
      )
    },

    async getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo> {
      const accessToken = tokens.accessToken()

      // Fetch user profile from Microsoft Graph API
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch Entra user info: ${response.status}`)
      }

      const profile = (await response.json()) as {
        id: string
        displayName?: string
        givenName?: string
        surname?: string
        mail?: string
        userPrincipalName?: string
        jobTitle?: string
        department?: string
      }

      return {
        providerId: profile.id,
        email: profile.mail || profile.userPrincipalName,
        name: profile.displayName,
        firstName: profile.givenName,
        lastName: profile.surname,
        rawClaims: profile,
      }
    },
  }
}
