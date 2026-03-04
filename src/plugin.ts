import type { AuthStrategy, Config, Endpoint, Field, PayloadRequest } from 'payload'
import { JWTAuthentication } from 'payload'
import { generateState, generateCodeVerifier } from 'arctic'

import type {
  ArcticOAuthPluginConfig,
  OAuthStateData,
  OAuthUserInfo,
  ProviderButtonInfo,
  ArcticClient,
  ArcticClientNoPKCE,
} from './providers/types.js'

// Re-export provider types and factories
export { entraProvider, type EntraProviderConfig } from './providers/entra.js'
export type {
  ArcticOAuthPluginConfig,
  OAuthProvider,
  OAuthUserInfo,
  OAuthAccount,
  ProviderButtonInfo,
} from './providers/types.js'

const OAUTH_STATE_COOKIE = 'oauth_state'
const COOKIE_MAX_AGE = 600 // 10 minutes

/**
 * Encode state data to base64url for cookie storage
 */
function encodeState(data: OAuthStateData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url')
}

/**
 * Decode state data from base64url cookie
 */
function decodeState(encoded: string): OAuthStateData | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}

/**
 * Build a Set-Cookie header string with Secure flag conditional on protocol.
 * Browsers reject Secure cookies on plain HTTP, which breaks localhost dev flows.
 */
function buildStateCookie(value: string, isSecure: boolean, maxAge: number): string {
  return `${OAUTH_STATE_COOKIE}=${value}; HttpOnly;${isSecure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=${maxAge}`
}

/**
 * Get the base URL from a PayloadRequest
 */
function getBaseUrl(req: PayloadRequest): string {
  if (req.url) {
    try {
      const url = new URL(req.url)
      return `${url.protocol}//${url.host}`
    } catch {
      // Fall through
    }
  }
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
  return new URLSearchParams()
}

/**
 * PayloadCMS OAuth Plugin using Arctic
 *
 * @example
 * ```ts
 * import { arcticOAuthPlugin, entraProvider } from 'payload-auth-arctic'
 *
 * export default buildConfig({
 *   plugins: [
 *     arcticOAuthPlugin({
 *       providers: [
 *         entraProvider({
 *           clientId: process.env.ENTRA_CLIENT_ID!,
 *           clientSecret: process.env.ENTRA_CLIENT_SECRET!,
 *           tenantId: process.env.ENTRA_TENANT_ID!,
 *         }),
 *       ],
 *     }),
 *   ],
 * })
 * ```
 */

export const arcticOAuthPlugin =
  (pluginConfig: ArcticOAuthPluginConfig) =>
  (config: Config): Config => {
    const {
      providers,
      userCollection = 'users',
      autoCreateUsers = true,
      successRedirect = '/admin',
      failureRedirect = '/admin/login?error=oauth_failed',
      enabled = true,
      disableLocalStrategy = false,
    } = pluginConfig

    if (!enabled) {
      return config
    }

    if (!config.collections) {
      config.collections = []
    }

    // Validate no duplicate provider slugs
    const seenSlugs = new Set<string>()
    for (const provider of providers) {
      const slug = provider.slug ?? provider.name
      if (seenSlugs.has(slug)) {
        throw new Error(
          `Duplicate OAuth provider slug: "${slug}". Each provider must have a unique slug (or name if no slug specified).`,
        )
      }
      seenSlugs.add(slug)
    }

    // Build provider info for the login buttons
    const providerButtons: ProviderButtonInfo[] = providers.map((provider) => {
      const providerKey = provider.slug ?? provider.name
      return {
        key: providerKey,
        displayName: provider.displayName,
        authorizePath: `/api/${userCollection}/oauth/${providerKey}`,
      }
    })

    // Create OAuth endpoints for each provider
    const oauthEndpoints: Endpoint[] = []

    for (const provider of providers) {
      const providerKey = provider.slug ?? provider.name
      // Authorize endpoint - redirects to OAuth provider
      oauthEndpoints.push({
        path: `/oauth/${providerKey}`,
        method: 'get',
        handler: async (req: PayloadRequest) => {
          try {
            const baseUrl = getBaseUrl(req)
            const isSecure = baseUrl.startsWith('https')
            const redirectUri = `${baseUrl}/api/${userCollection}/oauth/${providerKey}/callback`

            const client = provider.createClient(redirectUri)
            const state = generateState()
            const usesPKCE = provider.supportsPKCE !== false
            const codeVerifier = usesPKCE ? generateCodeVerifier() : ''

            // Build authorization URL (with or without PKCE)
            let authUrl = usesPKCE
              ? (client as ArcticClient).createAuthorizationURL(
                  state,
                  codeVerifier,
                  provider.defaultScopes,
                )
              : (client as ArcticClientNoPKCE).createAuthorizationURL(state, provider.defaultScopes)

            // Allow provider to modify authorization URL (e.g., add prompt param)
            if (provider.modifyAuthorizationURL) {
              authUrl = provider.modifyAuthorizationURL(authUrl)
            }

            // Store state data in cookie
            const stateData: OAuthStateData = {
              state,
              codeVerifier,
              provider: providerKey,
              returnTo: (req.query?.returnTo as string) || successRedirect,
            }

            return new Response(null, {
              status: 302,
              headers: {
                Location: authUrl.toString(),
                'Set-Cookie': buildStateCookie(encodeState(stateData), isSecure, COOKIE_MAX_AGE),
              },
            })
          } catch (error) {
            console.error(`OAuth authorize error (${providerKey}):`, error)
            return new Response(null, {
              status: 302,
              headers: {
                Location: `${failureRedirect}&message=authorization_failed`,
              },
            })
          }
        },
      })

      // Callback endpoint - handles OAuth response
      oauthEndpoints.push({
        path: `/oauth/${providerKey}/callback`,
        method: 'get',
        handler: async (req: PayloadRequest) => {
          const baseUrl = getBaseUrl(req)
          const isSecure = baseUrl.startsWith('https')
          const clearCookie = buildStateCookie('', isSecure, 0)

          try {
            const searchParams = getSearchParams(req)
            const code = searchParams.get('code') || (req.query?.code as string)
            const returnedState = searchParams.get('state') || (req.query?.state as string)
            const error = searchParams.get('error') || (req.query?.error as string)
            const errorDescription =
              searchParams.get('error_description') || (req.query?.error_description as string)

            // Handle OAuth errors from provider
            if (error) {
              console.error(`OAuth error (${providerKey}):`, error, errorDescription)
              return new Response(null, {
                status: 302,
                headers: {
                  Location: `${failureRedirect}&message=${encodeURIComponent(errorDescription || error)}`,
                  'Set-Cookie': clearCookie,
                },
              })
            }

            if (!code || !returnedState) {
              console.warn(`[payload-auth-arctic] OAuth callback (${providerKey}): missing code or state parameter`)
              return new Response(null, {
                status: 302,
                headers: {
                  Location: `${failureRedirect}&message=missing_code_or_state`,
                  'Set-Cookie': clearCookie,
                },
              })
            }

            // Retrieve and validate state from cookie
            const cookieHeader = req.headers?.get?.('cookie') || ''
            const stateCookieMatch = cookieHeader.match(new RegExp(`${OAUTH_STATE_COOKIE}=([^;]+)`))

            if (!stateCookieMatch) {
              console.warn(
                `[payload-auth-arctic] OAuth callback (${providerKey}): state cookie not found. ` +
                `This commonly happens when the cookie was set with the Secure flag on an HTTP connection. ` +
                `Base URL: ${baseUrl}`,
              )
              return new Response(null, {
                status: 302,
                headers: {
                  Location: `${failureRedirect}&message=missing_state_cookie`,
                },
              })
            }

            const stateData = decodeState(stateCookieMatch[1])

            if (
              !stateData ||
              stateData.state !== returnedState ||
              stateData.provider !== providerKey
            ) {
              console.warn(
                `[payload-auth-arctic] OAuth callback (${providerKey}): state validation failed. ` +
                `Expected provider: ${providerKey}, got: ${stateData?.provider ?? 'null'}`,
              )
              return new Response(null, {
                status: 302,
                headers: {
                  Location: `${failureRedirect}&message=invalid_state`,
                  'Set-Cookie': clearCookie,
                },
              })
            }

            // Exchange code for tokens using Arctic
            const redirectUri = `${baseUrl}/api/${userCollection}/oauth/${providerKey}/callback`
            const client = provider.createClient(redirectUri)
            const usesPKCE = provider.supportsPKCE !== false

            const tokens = usesPKCE
              ? await (client as ArcticClient).validateAuthorizationCode(
                  code,
                  stateData.codeVerifier,
                )
              : await (client as ArcticClientNoPKCE).validateAuthorizationCode(code)

            // Get user info from provider
            const userInfo = await provider.getUserInfo(tokens)

            if (!userInfo.email) {
              throw new Error('No email returned from OAuth provider')
            }

            // Find or create user
            const user = await findOrCreateUser(req, {
              provider: providerKey,
              userInfo,
              userCollection,
              autoCreateUsers,
              pluginConfig,
            })

            if (!user) {
              console.warn(`[payload-auth-arctic] OAuth callback (${providerKey}): no user found or created for ${userInfo.email}`)
              return new Response(null, {
                status: 302,
                headers: {
                  Location: `${failureRedirect}&message=user_not_found`,
                  'Set-Cookie': clearCookie,
                },
              })
            }

            // Call authorizeLogin gate if provided
            if (pluginConfig.authorizeLogin) {
              const authorized = await pluginConfig.authorizeLogin({
                user,
                userInfo,
                provider: providerKey,
              })
              if (!authorized) {
                console.warn(`[payload-auth-arctic] OAuth callback (${providerKey}): authorizeLogin denied access for ${(user as Record<string, unknown>).email || (user as Record<string, unknown>).id}`)
                return new Response(null, {
                  status: 302,
                  headers: {
                    Location: `${failureRedirect}&message=access_denied`,
                    'Set-Cookie': clearCookie,
                  },
                })
              }
            }

            // Call afterLogin hook if provided
            if (pluginConfig.afterLogin) {
              await pluginConfig.afterLogin({ user, userInfo, provider: providerKey })
            }

            // Generate Payload JWT token
            const { jwtSign, generatePayloadCookie } = await import('payload')

            const collectionConfig = req.payload.collections[userCollection].config
            const tokenExpiration =
              typeof collectionConfig.auth === 'object'
                ? collectionConfig.auth.tokenExpiration || 7200
                : 7200

            const fieldsToSign: Record<string, unknown> = {
              id: user.id,
              collection: userCollection,
              email: user.email || userInfo.email,
            }

            const { token: payloadToken } = await jwtSign({
              fieldsToSign,
              secret: req.payload.secret,
              tokenExpiration,
            })

            // Set token as cookie using Payload's cookie generator
            const cookiePrefix = req.payload.config.cookiePrefix || 'payload'

            // The collectionConfig.auth is already the sanitized auth config from Payload
            // It contains cookies settings, tokenExpiration, etc.
            const authConfig = collectionConfig.auth

            // Generate the payload token cookie using Payload's utility
            const payloadCookie = generatePayloadCookie({
              collectionAuthConfig: authConfig,
              cookiePrefix,
              token: payloadToken,
            })

            // Set auth cookie and redirect (state cookie expires on its own via Max-Age)
            return new Response(null, {
              status: 302,
              headers: {
                Location: stateData.returnTo || successRedirect,
                'Set-Cookie': payloadCookie,
              },
            })
          } catch (error) {
            console.error(`OAuth callback error (${providerKey}):`, error)
            return new Response(null, {
              status: 302,
              headers: {
                Location: `${failureRedirect}&message=${encodeURIComponent((error as Error).message)}`,
                'Set-Cookie': clearCookie,
              },
            })
          }
        },
      })
    }

    // Endpoint to get available providers (for dynamic login buttons)
    oauthEndpoints.push({
      path: '/oauth/providers',
      method: 'get',
      handler: async () => {
        return Response.json({
          providers: providerButtons,
          disableLocalStrategy,
        })
      },
    })

    // OAuth accounts field - supports multiple providers per user
    const oauthAccountsField: Field = {
      name: 'oauthAccounts',
      type: 'array',
      admin: {
        readOnly: true,
        position: 'sidebar',
        condition: (data) => data?.oauthAccounts?.length > 0,
      },
      fields: [
        { name: 'provider', type: 'text', required: true },
        { name: 'providerId', type: 'text', required: true },
        { name: 'email', type: 'email' },
        { name: 'connectedAt', type: 'date' },
      ],
    }

    // SSO data fields from Graph API (stored as JSON)
    const ssoFields: Field[] = [
      {
        name: 'ssoProfile',
        type: 'json',
        admin: {
          readOnly: true,
          position: 'sidebar',
          condition: (data) => Boolean(data?.ssoProfile),
        },
      },
      {
        name: 'ssoGroups',
        type: 'json',
        admin: {
          readOnly: true,
          position: 'sidebar',
          condition: (data) => Boolean(data?.ssoGroups),
        },
      },
      {
        name: 'ssoRoles',
        type: 'json',
        admin: {
          readOnly: true,
          position: 'sidebar',
          condition: (data) => Boolean(data?.ssoRoles),
        },
      },
    ]

    // Modify collections
    const collections = (config.collections || []).map((collection) => {
      if (collection.slug !== userCollection) {
        return collection
      }

      // Build the auth config with disableLocalStrategy if needed
      let authConfig = collection.auth
      if (disableLocalStrategy) {
        if (authConfig === true) {
          authConfig = { disableLocalStrategy: true }
        } else if (typeof authConfig === 'object') {
          authConfig = { ...authConfig, disableLocalStrategy: true }
        }

        // When disableLocalStrategy is true, Payload skips registering the
        // built-in 'local-jwt' auth strategy, which breaks cookie-based
        // authentication entirely. We must inject the JWT strategy ourselves.
        if (typeof authConfig === 'object') {
          const existing = (authConfig as { strategies?: AuthStrategy[] }).strategies || []
          authConfig = {
            ...authConfig,
            strategies: [
              ...existing,
              { name: 'oauth-jwt', authenticate: JWTAuthentication },
            ],
          }
        }
      }

      return {
        ...collection,
        auth: authConfig,
        endpoints: [...(collection.endpoints || []), ...oauthEndpoints],
        fields: [...(collection.fields || []), oauthAccountsField, ...ssoFields],
      }
    })

    // Check if user collection exists, if not add a basic one
    const hasUserCollection = collections.some((c) => c.slug === userCollection)
    if (!hasUserCollection) {
      collections.push({
        slug: userCollection,
        auth: disableLocalStrategy
          ? {
              disableLocalStrategy: true,
              strategies: [{ name: 'oauth-jwt', authenticate: JWTAuthentication }],
            }
          : true,
        endpoints: oauthEndpoints,
        fields: [
          {
            name: 'email',
            type: 'email',
            required: true,
            unique: true,
          },
          oauthAccountsField,
          ...ssoFields,
        ],
      })
    }

    // Setup admin components for login buttons
    if (!config.admin) {
      config.admin = {}
    }
    if (!config.admin.components) {
      config.admin.components = {}
    }
    if (!config.admin.components.afterLogin) {
      config.admin.components.afterLogin = []
    }

    config.admin.components.afterLogin.push('payload-auth-arctic/client#OAuthButtons')

    return {
      ...config,
      collections,
    }
  }

/**
 * Find an existing user or create a new one
 */
async function findOrCreateUser(
  req: PayloadRequest,
  args: {
    provider: string
    userInfo: OAuthUserInfo
    userCollection: string
    autoCreateUsers: boolean
    pluginConfig: ArcticOAuthPluginConfig
  },
): Promise<Record<string, unknown> | null> {
  const { provider, userInfo, userCollection, autoCreateUsers, pluginConfig } = args

  // First, try to find by OAuth account (provider + providerId)
  const existingByOAuth = await req.payload.find({
    collection: userCollection,
    where: {
      and: [
        { 'oauthAccounts.provider': { equals: provider } },
        { 'oauthAccounts.providerId': { equals: userInfo.providerId } },
      ],
    },
    limit: 1,
  })

  if (existingByOAuth.docs.length > 0) {
    const existingUser = existingByOAuth.docs[0] as Record<string, unknown>

    // Refresh providerData (ssoProfile, ssoGroups, ssoRoles) on every login
    if (userInfo.providerData && Object.keys(userInfo.providerData).length > 0) {
      const updated = await req.payload.update({
        collection: userCollection,
        id: existingUser.id as number | string,
        data: userInfo.providerData,
      })
      return updated as Record<string, unknown>
    }

    return existingUser
  }

  // Try to find by email
  if (userInfo.email) {
    const existingByEmail = await req.payload.find({
      collection: userCollection,
      where: { email: { equals: userInfo.email } },
      limit: 1,
    })

    if (existingByEmail.docs.length > 0) {
      // Link OAuth account to existing user
      const existingUser = existingByEmail.docs[0] as Record<string, unknown>
      const oauthAccounts = (existingUser.oauthAccounts as Array<Record<string, unknown>>) || []

      const updated = await req.payload.update({
        collection: userCollection,
        id: existingUser.id as number | string,
        data: {
          oauthAccounts: [
            ...oauthAccounts,
            {
              provider,
              providerId: userInfo.providerId,
              email: userInfo.email,
              connectedAt: new Date().toISOString(),
            },
          ],
          ...(userInfo.providerData || {}),
        },
      })

      return updated as Record<string, unknown>
    }
  }

  // Auto-create new user if enabled
  if (autoCreateUsers) {
    // Map user fields
    let userData: Record<string, unknown>

    if (pluginConfig.mapUserFields) {
      userData = pluginConfig.mapUserFields(userInfo, provider)
    } else {
      userData = {
        email: userInfo.email,
        name: userInfo.name || userInfo.email?.split('@')[0],
      }
    }

    // Call beforeUserCreate hook if provided
    if (pluginConfig.beforeUserCreate) {
      userData = await pluginConfig.beforeUserCreate({ userInfo, provider })
    }

    // Generate a random password for OAuth users (they won't use it)
    const { randomBytes } = await import('node:crypto')
    const randomPassword = randomBytes(32).toString('base64url')

    const newUser = await req.payload.create({
      collection: userCollection,
      data: {
        ...userData,
        password: randomPassword,
        oauthAccounts: [
          {
            provider,
            providerId: userInfo.providerId,
            email: userInfo.email,
            connectedAt: new Date().toISOString(),
          },
        ],
        ...(userInfo.providerData || {}),
      },
    })

    return newUser as Record<string, unknown>
  }

  return null
}
