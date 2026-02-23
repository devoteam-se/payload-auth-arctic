import { MicrosoftEntraId } from 'arctic'
import type { OAuth2Tokens } from 'arctic'
import type { OAuthProvider, OAuthUserInfo } from './types.js'
import { fetchGraphProfile, fetchGraphMemberOf } from '../lib/graph.js'

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
  /**
   * Microsoft Graph API features to enable.
   * When enabled, the provider fetches additional data and adds required scopes automatically.
   */
  graph?: {
    /** Fetch full /me profile from Graph */
    profile?: boolean
    /** Fetch /me/memberOf groups (adds GroupMember.Read.All scope) */
    groups?: boolean
    /** Fetch /me/memberOf directory roles (adds Directory.Read.All scope) */
    roles?: boolean
  }
  /**
   * Entra login prompt behavior
   * @default 'select_account'
   */
  prompt?: 'select_account' | 'login' | 'consent' | 'none'
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
 *   graph: { profile: true, groups: true, roles: true },
 * })
 * ```
 */
export function entraProvider(config: EntraProviderConfig): OAuthProvider {
  const graphConfig = config.graph || {}
  const prompt = config.prompt ?? 'select_account'

  // Build scopes dynamically based on graph config
  const scopes = ['openid', 'profile', 'email', 'User.Read']
  if (graphConfig.groups) {
    scopes.push('GroupMember.Read.All')
  }
  if (graphConfig.roles) {
    scopes.push('Directory.Read.All')
  }
  if (config.scopes) {
    scopes.push(...config.scopes)
  }

  const needsGraph = graphConfig.profile || graphConfig.groups || graphConfig.roles

  return {
    name: 'entra',
    displayName: 'Microsoft',
    defaultScopes: scopes,

    createClient(redirectUri: string) {
      return new MicrosoftEntraId(
        config.tenantId,
        config.clientId,
        config.clientSecret,
        redirectUri,
      )
    },

    modifyAuthorizationURL(url: URL): URL {
      url.searchParams.set('prompt', prompt)
      return url
    },

    async getUserInfo(tokens: OAuth2Tokens): Promise<OAuthUserInfo> {
      const accessToken = tokens.accessToken()

      // Always fetch basic profile
      const profile = await fetchGraphProfile(accessToken)

      const providerData: Record<string, unknown> = {}

      if (needsGraph) {
        if (graphConfig.profile) {
          providerData.ssoProfile = profile
        }

        if (graphConfig.groups || graphConfig.roles) {
          const memberOf = await fetchGraphMemberOf(accessToken)
          if (graphConfig.groups) {
            providerData.ssoGroups = memberOf.groups
          }
          if (graphConfig.roles) {
            providerData.ssoRoles = memberOf.roles
          }
        }
      }

      return {
        providerId: profile.id!,
        email: profile.mail || profile.userPrincipalName,
        name: profile.displayName,
        firstName: profile.givenName,
        lastName: profile.surname,
        rawClaims: profile,
        ...(Object.keys(providerData).length > 0 ? { providerData } : {}),
      }
    },
  }
}
