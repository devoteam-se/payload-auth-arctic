import type { Config, Endpoint, PayloadRequest } from 'payload'

import type { OAuthStateData, SSOPluginConfig } from './types.js'

import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from './lib/pkce.js'

// Legacy exports (for backward compatibility)
export type {
  EntraConfig,
  OIDCClaims,
  SSOPluginConfig,
  TokenResponse,
  TokenValidationOptions,
} from './types.js'

// New Arctic-based plugin exports (recommended)
export { arcticOAuthPlugin, entraProvider, googleProvider, githubProvider } from './plugin.js'
export type {
  ArcticOAuthPluginConfig,
  OAuthProvider,
  OAuthUserInfo,
  OAuthAccount,
  ProviderButtonInfo,
  EntraProviderConfig,
  GoogleProviderConfig,
  GitHubProviderConfig,
} from './plugin.js'

const SSO_STATE_COOKIE = 'sso_state'

/**
 * Encode state data to base64 for cookie storage
 */
function encodeState(data: OAuthStateData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url')
}

/**
 * Decode state data from base64 cookie
 */
function decodeState(encoded: string): null | OAuthStateData {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}

/**
 * Build Entra authorization URL
 */
function buildEntraAuthUrl(params: {
  clientId: string
  codeChallenge: string
  nonce: string
  redirectUri: string
  scopes?: string[]
  state: string
  tenantId: string
}): string {
  const { clientId, codeChallenge, nonce, redirectUri, scopes, state, tenantId } = params

  const searchParams = new URLSearchParams({
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce,
    prompt: 'select_account',
    redirect_uri: redirectUri,
    response_mode: 'query',
    response_type: 'code',
    scope: (scopes || ['openid', 'profile', 'email']).join(' '),
    state,
  })

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${searchParams.toString()}`
}

/**
 * Build scopes based on Entra config
 */
function buildScopes(entra: SSOPluginConfig['entra']): string[] {
  const baseScopes = ['openid', 'profile', 'email']
  const graphScopes: string[] = []

  if (entra.graph?.profile) {
    graphScopes.push('User.Read')
  }

  if (entra.graph?.groups) {
    graphScopes.push('GroupMember.Read.All')
  }

  if (entra.graph?.roles) {
    graphScopes.push('Directory.Read.All')
  }

  const extraScopes = entra.scopes || []

  return Array.from(new Set([...baseScopes, ...extraScopes, ...graphScopes]))
}

/**
 * Get the base URL from a PayloadRequest
 */
function getBaseUrl(req: PayloadRequest): string {
  // Try to get from the request URL
  if (req.url) {
    try {
      const url = new URL(req.url)
      return `${url.protocol}//${url.host}`
    } catch {
      // Fall through to header-based approach
    }
  }

  // Fallback: construct from headers
  const host =
    req.headers?.get?.('host') || req.headers?.get?.('x-forwarded-host') || 'localhost:3000'
  const protocol = req.headers?.get?.('x-forwarded-proto') || 'http'
  return `${protocol}://${host}`
}

/**
 * Parse URL search params from PayloadRequest
 */
function getSearchParams(req: PayloadRequest): URLSearchParams {
  if (req.url) {
    try {
      return new URL(req.url).searchParams
    } catch {
      // Fall through
    }
  }
  // Fallback to query object if available
  return new URLSearchParams()
}

/**
 * PayloadCMS SSO Plugin for Microsoft Entra ID
 */
export const payloadAuthSso =
  (pluginOptions: SSOPluginConfig) =>
  (config: Config): Config => {
    const {
      enabled = true,
      entra,
      failureRedirect = '/admin/login?error=sso_failed',
      successRedirect = '/admin',
      userCollection = 'users',
    } = pluginOptions

    // Keep schema consistent even when disabled
    if (!enabled) {
      return config
    }

    if (!config.endpoints) {
      config.endpoints = []
    }

    if (!config.collections) {
      config.collections = []
    }

    // Create SSO endpoints
    const ssoEndpoints: Endpoint[] = [
      // Authorization endpoint - redirects to Entra
      {
        handler: async (req: PayloadRequest) => {
          try {
            const verifier = generateCodeVerifier()
            const challenge = generateCodeChallenge(verifier)
            const state = generateState()
            const nonce = generateNonce()

            const baseUrl = getBaseUrl(req)
            const redirectUri = `${baseUrl}/api/${userCollection}/sso/callback`

            const stateData: OAuthStateData = {
              nonce,
              returnTo: (req.query?.returnTo as string) || successRedirect,
              state,
              verifier,
            }

            const authUrl = buildEntraAuthUrl({
              clientId: entra.clientId,
              codeChallenge: challenge,
              nonce,
              redirectUri,
              scopes: buildScopes(entra),
              state,
              tenantId: entra.tenantId,
            })

            const stateCookie = encodeState(stateData)

            return new Response(null, {
              headers: {
                Location: authUrl,
                'Set-Cookie': `${SSO_STATE_COOKIE}=${stateCookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
              },
              status: 302,
            })
          } catch (error) {
            console.error('SSO authorize error:', error)
            return new Response(null, {
              headers: {
                Location: `${failureRedirect}&message=authorization_failed`,
              },
              status: 302,
            })
          }
        },
        method: 'get',
        path: '/sso/authorize',
      },

      // Callback endpoint - handles OAuth response
      {
        handler: async (req: PayloadRequest) => {
          try {
            // Parse query params from URL or query object
            const searchParams = getSearchParams(req)
            const code = searchParams.get('code') || (req.query?.code as string)
            const state = searchParams.get('state') || (req.query?.state as string)
            const error = searchParams.get('error') || (req.query?.error as string)
            const errorDescription =
              searchParams.get('error_description') || (req.query?.error_description as string)

            // Handle OAuth errors from provider
            if (error) {
              console.error('SSO OAuth error:', error, errorDescription)
              return new Response(null, {
                headers: {
                  Location: `${failureRedirect}&message=${encodeURIComponent(errorDescription || error)}`,
                  'Set-Cookie': `${SSO_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
                },
                status: 302,
              })
            }

            if (!code || !state) {
              return new Response(null, {
                headers: {
                  Location: `${failureRedirect}&message=missing_code_or_state`,
                  'Set-Cookie': `${SSO_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
                },
                status: 302,
              })
            }

            // Retrieve state from cookie
            const cookieHeader = req.headers?.get?.('cookie') || ''
            const stateCookieMatch = cookieHeader.match(new RegExp(`${SSO_STATE_COOKIE}=([^;]+)`))
            if (!stateCookieMatch) {
              return new Response(null, {
                headers: {
                  Location: `${failureRedirect}&message=missing_state_cookie`,
                },
                status: 302,
              })
            }

            const stateData = decodeState(stateCookieMatch[1])
            if (!stateData || stateData.state !== state) {
              return new Response(null, {
                headers: {
                  Location: `${failureRedirect}&message=invalid_state`,
                  'Set-Cookie': `${SSO_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
                },
                status: 302,
              })
            }

            // Import token utilities dynamically to avoid circular deps
            const { decodeIdToken, exchangeCodeForTokens, validateAndDecodeIdToken } =
              await import('./lib/tokens.js')

            const baseUrl = getBaseUrl(req)
            const redirectUri = `${baseUrl}/api/${userCollection}/sso/callback`

            // Exchange code for tokens
            const tokens = await exchangeCodeForTokens({
              clientId: entra.clientId,
              clientSecret: entra.clientSecret,
              code,
              codeVerifier: stateData.verifier,
              redirectUri,
              tenantId: entra.tenantId,
            })

            if (!tokens.id_token) {
              throw new Error('No ID token in response')
            }

            // Validate and decode ID token with full security checks
            // Enterprise-grade: signature verification, issuer/audience/tenant validation, nonce check
            let claims
            if (entra.skipSignatureValidation) {
              // Development mode: skip signature validation (NOT RECOMMENDED for production)
              console.warn('SSO: Skipping token signature validation (development mode)')
              claims = decodeIdToken(tokens.id_token)
            } else {
              // Production mode: full token validation
              claims = await validateAndDecodeIdToken(tokens.id_token, {
                clientId: entra.clientId,
                expectedNonce: stateData.nonce,
                tenantId: entra.tenantId,
              })
            }

            // Optionally fetch additional data from Microsoft Graph
            const shouldFetchProfile = Boolean(entra.graph?.profile)
            const shouldFetchGroups = Boolean(entra.graph?.groups)
            const shouldFetchRoles = Boolean(entra.graph?.roles)

            let graphProfile: Record<string, unknown> | undefined
            let graphGroups: Array<{ displayName?: string; id: string }> | undefined
            let graphRoles: Array<{ displayName?: string; id: string }> | undefined

            if (
              tokens.access_token &&
              (shouldFetchProfile || shouldFetchGroups || shouldFetchRoles)
            ) {
              try {
                const { fetchGraphMemberOf, fetchGraphProfile } = await import('./lib/graph.js')

                if (shouldFetchProfile) {
                  graphProfile = await fetchGraphProfile(tokens.access_token)
                }

                if (shouldFetchGroups || shouldFetchRoles) {
                  const memberOf = await fetchGraphMemberOf(tokens.access_token)
                  if (shouldFetchGroups) {
                    graphGroups = memberOf.groups
                  }
                  if (shouldFetchRoles) {
                    graphRoles = memberOf.roles
                  }
                }
              } catch (error) {
                console.warn('SSO Graph fetch error:', error)
              }
            }

            const graphEmail =
              (graphProfile?.mail as string | undefined) ||
              (graphProfile?.userPrincipalName as string | undefined)

            if (!claims.email && !claims.preferred_username && !graphEmail) {
              throw new Error('No email in ID token claims')
            }

            const email = claims.email || claims.preferred_username || graphEmail
            const name =
              (graphProfile?.displayName as string | undefined) ||
              claims.name ||
              claims.given_name ||
              email?.split('@')[0]

            const ssoMetadata: Record<string, unknown> = {}
            if (graphProfile) {
              ssoMetadata.ssoProfile = graphProfile
            }
            if (graphGroups) {
              ssoMetadata.ssoGroups = graphGroups
            }
            if (graphRoles) {
              ssoMetadata.ssoRoles = graphRoles
            }

            // Find or create user
            const existingUsers = await req.payload.find({
              collection: userCollection,
              limit: 1,
              where: {
                or: [{ email: { equals: email } }, { ssoSubjectId: { equals: claims.sub } }],
              },
            })

            let user = existingUsers.docs[0] as Record<string, unknown> | undefined

            if (!user) {
              // Auto-provision new user
              if (pluginOptions.autoProvisionUsers !== false) {
                // Generate a random password for SSO users (they won't use it)
                const { randomBytes } = await import('node:crypto')
                const randomPassword = randomBytes(32).toString('base64url')

                user = (await req.payload.create({
                  collection: userCollection,
                  data: {
                    name,
                    email,
                    password: randomPassword,
                    ssoProvider: 'entra',
                    ssoSubjectId: claims.sub,
                    ...ssoMetadata,
                  },
                })) as Record<string, unknown>
              } else {
                return new Response(null, {
                  headers: {
                    Location: `${failureRedirect}&message=user_not_found`,
                    'Set-Cookie': `${SSO_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
                  },
                  status: 302,
                })
              }
            } else if (!user.ssoSubjectId) {
              // Link existing user to SSO identity
              await req.payload.update({
                id: user.id as number | string,
                collection: userCollection,
                data: {
                  ssoProvider: 'entra',
                  ssoSubjectId: claims.sub,
                  ...ssoMetadata,
                },
              })
            } else if (Object.keys(ssoMetadata).length > 0) {
              // Keep SSO metadata fresh on subsequent logins
              await req.payload.update({
                id: user.id as number | string,
                collection: userCollection,
                data: {
                  ...ssoMetadata,
                },
              })
            }

            // Generate Payload JWT token using jwtSign
            const { jwtSign } = await import('payload')

            // Get the collection config for token expiration
            const collectionConfig = req.payload.collections[userCollection].config
            const tokenExpiration =
              typeof collectionConfig.auth === 'object'
                ? collectionConfig.auth.tokenExpiration || 7200
                : 7200

            // Create fields to sign (minimal required fields)
            const fieldsToSign: Record<string, unknown> = {
              id: user.id,
              collection: userCollection,
              email: user.email || email,
            }

            // Sign the JWT
            const { token: payloadToken } = await jwtSign({
              fieldsToSign,
              secret: req.payload.secret,
              tokenExpiration,
            })

            // Determine cookie prefix from config
            const cookiePrefix = req.payload.config.cookiePrefix || 'payload'

            return new Response(null, {
              headers: {
                Location: stateData.returnTo || successRedirect,
                'Set-Cookie': [
                  `${cookiePrefix}-token=${payloadToken}; HttpOnly; Secure; SameSite=Lax; Path=/`,
                  `${SSO_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
                ].join(', '),
              },
              status: 302,
            })
          } catch (error) {
            console.error('SSO callback error:', error)
            return new Response(null, {
              headers: {
                Location: `${failureRedirect}&message=${encodeURIComponent((error as Error).message)}`,
                'Set-Cookie': `${SSO_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
              },
              status: 302,
            })
          }
        },
        method: 'get',
        path: '/sso/callback',
      },
    ]

    // SSO identity fields to add to user collection
    const ssoFields = [
      {
        name: 'ssoProvider',
        type: 'text' as const,
        admin: {
          position: 'sidebar' as const,
          readOnly: true,
        },
      },
      {
        name: 'ssoSubjectId',
        type: 'text' as const,
        admin: {
          position: 'sidebar' as const,
          readOnly: true,
        },
        index: true,
      },
      {
        name: 'ssoProfile',
        type: 'json' as const,
        admin: {
          position: 'sidebar' as const,
          readOnly: true,
        },
      },
      {
        name: 'ssoGroups',
        type: 'json' as const,
        admin: {
          position: 'sidebar' as const,
          readOnly: true,
        },
      },
      {
        name: 'ssoRoles',
        type: 'json' as const,
        admin: {
          position: 'sidebar' as const,
          readOnly: true,
        },
      },
    ]

    // Check if user collection exists in config
    const existingUserCollection = config.collections.find((c) => c.slug === userCollection)

    let collections
    if (existingUserCollection) {
      // Modify existing user collection
      collections = config.collections.map((collection) => {
        if (collection.slug !== userCollection) {
          return collection
        }

        return {
          ...collection,
          endpoints: [...(collection.endpoints || []), ...ssoEndpoints],
          fields: [...(collection.fields || []), ...ssoFields],
        }
      })
    } else {
      // Add users collection with SSO config (Payload will merge with defaults)
      collections = [
        ...config.collections,
        {
          slug: userCollection,
          auth: true,
          endpoints: ssoEndpoints,
          fields: ssoFields,
        },
      ]
    }

    // Setup admin components
    if (!config.admin) {
      config.admin = {}
    }

    if (!config.admin.components) {
      config.admin.components = {}
    }

    if (!config.admin.components.afterLogin) {
      config.admin.components.afterLogin = []
    }

    config.admin.components.afterLogin.push('payload-auth-sso/client#AfterLogin')

    return {
      ...config,
      collections,
    }
  }
