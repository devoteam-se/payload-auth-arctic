import { jwtVerify } from 'jose';
import { generateState, generateCodeVerifier } from 'arctic';
/**
 * Custom JWT authentication strategy for OAuth.
 * Uses extractJWT from payload and jwtVerify from jose — mirrors
 * Payload's built-in JWTAuthentication so session validation works.
 */ const oauthJWTAuthenticate = async ({ headers, payload, strategyName = 'oauth-jwt' })=>{
    try {
        const { extractJWT } = await import('payload');
        const token = extractJWT({
            headers,
            payload
        });
        if (!token) return {
            user: null
        };
        const secretKey = new TextEncoder().encode(payload.secret);
        const { payload: decoded } = await jwtVerify(token, secretKey);
        if (!decoded?.id || !decoded?.collection) return {
            user: null
        };
        const collection = payload.collections[decoded.collection];
        if (!collection) return {
            user: null
        };
        const user = await payload.findByID({
            id: decoded.id,
            collection: decoded.collection,
            depth: collection.config.auth?.depth ?? 0,
            overrideAccess: true
        });
        if (!user) return {
            user: null
        };
        // Session validation — matches Payload's built-in JWTAuthentication (3.74.0+)
        const useSessions = collection.config.auth?.useSessions;
        if (useSessions) {
            const sessions = user.sessions || [];
            const existingSession = sessions.find(({ id })=>id === decoded.sid);
            if (!existingSession || !decoded.sid) {
                return {
                    user: null
                };
            }
            user._sid = decoded.sid;
        }
        user.collection = decoded.collection;
        user._strategy = strategyName;
        if (decoded.accessToken) {
            user.accessToken = decoded.accessToken;
        }
        return {
            user: user
        };
    } catch (error) {
        console.error('[payload-auth-arctic] JWT auth error:', error);
        return {
            user: null
        };
    }
};
// Re-export provider types and factories
export { entraProvider } from './providers/entra.js';
const OAUTH_STATE_COOKIE = 'oauth_state';
const COOKIE_MAX_AGE = 600 // 10 minutes
;
/**
 * Encode state data to base64url for cookie storage
 */ function encodeState(data) {
    return Buffer.from(JSON.stringify(data)).toString('base64url');
}
/**
 * Decode state data from base64url cookie
 */ function decodeState(encoded) {
    try {
        return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    } catch  {
        return null;
    }
}
/**
 * Build a Set-Cookie header string with Secure flag conditional on protocol.
 * Browsers reject Secure cookies on plain HTTP, which breaks localhost dev flows.
 */ function buildStateCookie(value, isSecure, maxAge) {
    return `${OAUTH_STATE_COOKIE}=${value}; HttpOnly;${isSecure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
/**
 * Get the base URL from a PayloadRequest.
 *
 * Resolution order:
 *   1. Explicit override from plugin config (baseUrl option)
 *   2. Payload's serverURL config
 *   3. Reverse-proxy forwarded headers (x-forwarded-host / x-forwarded-proto)
 *   4. Parse from req.url (fallback for direct access / local dev)
 *   5. Host header fallback
 *
 * req.url is checked *after* forwarded headers because containerised
 * environments (e.g. Azure App Service) often bind to 0.0.0.0, which
 * Next.js then bakes into req.url — making it unusable as a public URL.
 */ function getBaseUrl(req, overrideBaseUrl) {
    // 1. Explicit override from plugin config
    if (overrideBaseUrl) {
        return overrideBaseUrl.replace(/\/$/, '');
    }
    // 2. Payload's serverURL config
    const serverURL = req.payload?.config?.serverURL;
    if (serverURL) {
        return serverURL.replace(/\/$/, '');
    }
    // 3. Reverse proxy forwarded headers
    const forwardedHost = req.headers?.get?.('x-forwarded-host');
    if (forwardedHost) {
        const protocol = req.headers?.get?.('x-forwarded-proto') || 'https';
        return `${protocol}://${forwardedHost}`;
    }
    // 4. Parse from req.url (fallback for direct access / dev)
    if (req.url) {
        try {
            const url = new URL(req.url);
            return `${url.protocol}//${url.host}`;
        } catch  {
        // Fall through
        }
    }
    // 5. Host header fallback
    const host = req.headers?.get?.('host') || 'localhost:3000';
    const protocol = req.headers?.get?.('x-forwarded-proto') || 'http';
    return `${protocol}://${host}`;
}
/**
 * Parse URL search params from PayloadRequest
 */ function getSearchParams(req) {
    if (req.url) {
        try {
            return new URL(req.url).searchParams;
        } catch  {
        // Fall through
        }
    }
    return new URLSearchParams();
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
 */ export const arcticOAuthPlugin = (pluginConfig)=>(config)=>{
        const { providers, userCollection = 'users', autoCreateUsers = true, successRedirect = '/admin', failureRedirect = '/admin/login?error=oauth_failed', enabled = true, disableLocalStrategy = false, baseUrl: configBaseUrl } = pluginConfig;
        if (!enabled) {
            return config;
        }
        if (!config.collections) {
            config.collections = [];
        }
        // Validate no duplicate provider slugs
        const seenSlugs = new Set();
        for (const provider of providers){
            const slug = provider.slug ?? provider.name;
            if (seenSlugs.has(slug)) {
                throw new Error(`Duplicate OAuth provider slug: "${slug}". Each provider must have a unique slug (or name if no slug specified).`);
            }
            seenSlugs.add(slug);
        }
        // Build provider info for the login buttons
        const providerButtons = providers.map((provider)=>{
            const providerKey = provider.slug ?? provider.name;
            return {
                key: providerKey,
                displayName: provider.displayName,
                authorizePath: `/api/${userCollection}/oauth/${providerKey}`
            };
        });
        // Create OAuth endpoints for each provider
        const oauthEndpoints = [];
        for (const provider of providers){
            const providerKey = provider.slug ?? provider.name;
            // Authorize endpoint - redirects to OAuth provider
            oauthEndpoints.push({
                path: `/oauth/${providerKey}`,
                method: 'get',
                handler: async (req)=>{
                    try {
                        const baseUrl = getBaseUrl(req, configBaseUrl);
                        const isSecure = baseUrl.startsWith('https');
                        const redirectUri = `${baseUrl}/api/${userCollection}/oauth/${providerKey}/callback`;
                        const client = provider.createClient(redirectUri);
                        const state = generateState();
                        const usesPKCE = provider.supportsPKCE !== false;
                        const codeVerifier = usesPKCE ? generateCodeVerifier() : '';
                        // Build authorization URL (with or without PKCE)
                        let authUrl = usesPKCE ? client.createAuthorizationURL(state, codeVerifier, provider.defaultScopes) : client.createAuthorizationURL(state, provider.defaultScopes);
                        // Allow provider to modify authorization URL (e.g., add prompt param)
                        if (provider.modifyAuthorizationURL) {
                            authUrl = provider.modifyAuthorizationURL(authUrl);
                        }
                        // Store state data in cookie
                        const stateData = {
                            state,
                            codeVerifier,
                            provider: providerKey,
                            returnTo: req.query?.returnTo || successRedirect
                        };
                        return new Response(null, {
                            status: 302,
                            headers: {
                                Location: authUrl.toString(),
                                'Set-Cookie': buildStateCookie(encodeState(stateData), isSecure, COOKIE_MAX_AGE)
                            }
                        });
                    } catch (error) {
                        console.error(`OAuth authorize error (${providerKey}):`, error);
                        return new Response(null, {
                            status: 302,
                            headers: {
                                Location: `${failureRedirect}&message=authorization_failed`
                            }
                        });
                    }
                }
            });
            // Callback endpoint - handles OAuth response
            oauthEndpoints.push({
                path: `/oauth/${providerKey}/callback`,
                method: 'get',
                handler: async (req)=>{
                    const baseUrl = getBaseUrl(req, configBaseUrl);
                    const isSecure = baseUrl.startsWith('https');
                    const clearCookie = buildStateCookie('', isSecure, 0);
                    try {
                        const searchParams = getSearchParams(req);
                        const code = searchParams.get('code') || req.query?.code;
                        const returnedState = searchParams.get('state') || req.query?.state;
                        const error = searchParams.get('error') || req.query?.error;
                        const errorDescription = searchParams.get('error_description') || req.query?.error_description;
                        // Handle OAuth errors from provider
                        if (error) {
                            console.error(`OAuth error (${providerKey}):`, error, errorDescription);
                            return new Response(null, {
                                status: 302,
                                headers: {
                                    Location: `${failureRedirect}&message=${encodeURIComponent(errorDescription || error)}`,
                                    'Set-Cookie': clearCookie
                                }
                            });
                        }
                        if (!code || !returnedState) {
                            console.warn(`[payload-auth-arctic] OAuth callback (${providerKey}): missing code or state parameter`);
                            return new Response(null, {
                                status: 302,
                                headers: {
                                    Location: `${failureRedirect}&message=missing_code_or_state`,
                                    'Set-Cookie': clearCookie
                                }
                            });
                        }
                        // Retrieve and validate state from cookie
                        const cookieHeader = req.headers?.get?.('cookie') || '';
                        const stateCookieMatch = cookieHeader.match(new RegExp(`${OAUTH_STATE_COOKIE}=([^;]+)`));
                        if (!stateCookieMatch) {
                            console.warn(`[payload-auth-arctic] OAuth callback (${providerKey}): state cookie not found. ` + `This commonly happens when the cookie was set with the Secure flag on an HTTP connection. ` + `Base URL: ${baseUrl}`);
                            return new Response(null, {
                                status: 302,
                                headers: {
                                    Location: `${failureRedirect}&message=missing_state_cookie`
                                }
                            });
                        }
                        const stateData = decodeState(stateCookieMatch[1]);
                        if (!stateData || stateData.state !== returnedState || stateData.provider !== providerKey) {
                            console.warn(`[payload-auth-arctic] OAuth callback (${providerKey}): state validation failed. ` + `Expected provider: ${providerKey}, got: ${stateData?.provider ?? 'null'}`);
                            return new Response(null, {
                                status: 302,
                                headers: {
                                    Location: `${failureRedirect}&message=invalid_state`,
                                    'Set-Cookie': clearCookie
                                }
                            });
                        }
                        // Exchange code for tokens using Arctic
                        const redirectUri = `${baseUrl}/api/${userCollection}/oauth/${providerKey}/callback`;
                        const client = provider.createClient(redirectUri);
                        const usesPKCE = provider.supportsPKCE !== false;
                        const tokens = usesPKCE ? await client.validateAuthorizationCode(code, stateData.codeVerifier) : await client.validateAuthorizationCode(code);
                        // Get user info from provider
                        const userInfo = await provider.getUserInfo(tokens);
                        if (!userInfo.email) {
                            throw new Error('No email returned from OAuth provider');
                        }
                        // Find or create user
                        const user = await findOrCreateUser(req, {
                            provider: providerKey,
                            userInfo,
                            userCollection,
                            autoCreateUsers,
                            pluginConfig
                        });
                        if (!user) {
                            console.warn(`[payload-auth-arctic] OAuth callback (${providerKey}): no user found or created for ${userInfo.email}`);
                            return new Response(null, {
                                status: 302,
                                headers: {
                                    Location: `${failureRedirect}&message=user_not_found`,
                                    'Set-Cookie': clearCookie
                                }
                            });
                        }
                        // Call authorizeLogin gate if provided
                        if (pluginConfig.authorizeLogin) {
                            const authorized = await pluginConfig.authorizeLogin({
                                user,
                                userInfo,
                                provider: providerKey
                            });
                            if (!authorized) {
                                console.warn(`[payload-auth-arctic] OAuth callback (${providerKey}): authorizeLogin denied access for ${user.email || user.id}`);
                                return new Response(null, {
                                    status: 302,
                                    headers: {
                                        Location: `${failureRedirect}&message=access_denied`,
                                        'Set-Cookie': clearCookie
                                    }
                                });
                            }
                        }
                        // Call afterLogin hook if provided
                        if (pluginConfig.afterLogin) {
                            await pluginConfig.afterLogin({
                                user,
                                userInfo,
                                provider: providerKey
                            });
                        }
                        // Generate Payload JWT token
                        const { jwtSign, generatePayloadCookie } = await import('payload');
                        const collectionConfig = req.payload.collections[userCollection].config;
                        const tokenExpiration = typeof collectionConfig.auth === 'object' ? collectionConfig.auth.tokenExpiration || 7200 : 7200;
                        // Create session if useSessions is enabled (Payload 3.74+; absent in older versions)
                        const useSessions = typeof collectionConfig.auth === 'object' ? collectionConfig.auth.useSessions ?? false : false;
                        let sid;
                        if (useSessions) {
                            const { v4: uuid } = await import('uuid');
                            sid = uuid();
                            const now = new Date();
                            const expiresAt = new Date(now.getTime() + tokenExpiration * 1000);
                            const session = {
                                id: sid,
                                createdAt: now,
                                expiresAt
                            };
                            // Clean expired sessions, add new one
                            const existingSessions = (user.sessions || []).filter((s)=>{
                                const exp = s.expiresAt instanceof Date ? s.expiresAt : new Date(s.expiresAt);
                                return exp > now;
                            });
                            existingSessions.push(session);
                            await req.payload.db.updateOne({
                                id: user.id,
                                collection: userCollection,
                                data: {
                                    sessions: existingSessions,
                                    updatedAt: null
                                },
                                req,
                                returning: false
                            });
                        }
                        const fieldsToSign = {
                            id: user.id,
                            collection: userCollection,
                            email: user.email || userInfo.email,
                            ...sid ? {
                                sid
                            } : {},
                            ...pluginConfig.includeAccessTokenInJWT ? {
                                accessToken: tokens.accessToken()
                            } : {}
                        };
                        const { token: payloadToken } = await jwtSign({
                            fieldsToSign,
                            secret: req.payload.secret,
                            tokenExpiration
                        });
                        // Set token as cookie using Payload's cookie generator
                        const cookiePrefix = req.payload.config.cookiePrefix || 'payload';
                        // The collectionConfig.auth is already the sanitized auth config from Payload
                        // It contains cookies settings, tokenExpiration, etc.
                        const authConfig = collectionConfig.auth;
                        // Generate the payload token cookie using Payload's utility
                        let payloadCookie = generatePayloadCookie({
                            collectionAuthConfig: authConfig,
                            cookiePrefix,
                            token: payloadToken
                        });
                        // Strip Secure flag on HTTP — browsers reject Secure cookies on plain HTTP
                        if (!isSecure) {
                            payloadCookie = payloadCookie.replace(/;\s*Secure/i, '');
                        }
                        // Set auth cookie and redirect (state cookie expires on its own via Max-Age)
                        return new Response(null, {
                            status: 302,
                            headers: {
                                Location: stateData.returnTo || successRedirect,
                                'Set-Cookie': payloadCookie
                            }
                        });
                    } catch (error) {
                        console.error(`OAuth callback error (${providerKey}):`, error);
                        return new Response(null, {
                            status: 302,
                            headers: {
                                Location: `${failureRedirect}&message=${encodeURIComponent(error.message)}`,
                                'Set-Cookie': clearCookie
                            }
                        });
                    }
                }
            });
        }
        // Custom logout endpoint — Payload's built-in logout checks req.user which isn't
        // populated when disableLocalStrategy is true (the built-in auth middleware is skipped).
        // Custom collection endpoints are registered before built-in auth endpoints in the
        // sanitized endpoints array, so this handler matches first via endpoints.find().
        if (disableLocalStrategy) {
            oauthEndpoints.push({
                path: '/logout',
                method: 'post',
                handler: async (req)=>{
                    const baseUrl = getBaseUrl(req, configBaseUrl);
                    const isSecure = baseUrl.startsWith('https');
                    const cookiePrefix = req.payload.config.cookiePrefix || 'payload';
                    const expires = new Date(Date.now() - 1000).toUTCString();
                    const expiredCookie = `${cookiePrefix}-token=; HttpOnly; Path=/;${isSecure ? ' Secure;' : ''} SameSite=Lax; Expires=${expires}`;
                    return new Response(JSON.stringify({
                        message: 'Logged out successfully.'
                    }), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'Set-Cookie': expiredCookie
                        }
                    });
                }
            });
        }
        // Endpoint to get available providers (for dynamic login buttons)
        oauthEndpoints.push({
            path: '/oauth/providers',
            method: 'get',
            handler: async ()=>{
                return Response.json({
                    providers: providerButtons,
                    disableLocalStrategy
                });
            }
        });
        // OAuth accounts field - supports multiple providers per user
        const oauthAccountsField = {
            name: 'oauthAccounts',
            type: 'array',
            admin: {
                readOnly: true,
                position: 'sidebar',
                condition: (data)=>data?.oauthAccounts?.length > 0
            },
            fields: [
                {
                    name: 'provider',
                    type: 'text',
                    required: true
                },
                {
                    name: 'providerId',
                    type: 'text',
                    required: true
                },
                {
                    name: 'email',
                    type: 'email'
                },
                {
                    name: 'connectedAt',
                    type: 'date'
                }
            ]
        };
        // SSO data fields from Graph API (stored as JSON)
        const ssoFields = [
            {
                name: 'ssoProfile',
                type: 'json',
                admin: {
                    readOnly: true,
                    position: 'sidebar',
                    condition: (data)=>Boolean(data?.ssoProfile)
                }
            },
            {
                name: 'ssoGroups',
                type: 'json',
                admin: {
                    readOnly: true,
                    position: 'sidebar',
                    condition: (data)=>Boolean(data?.ssoGroups)
                }
            },
            {
                name: 'ssoRoles',
                type: 'json',
                admin: {
                    readOnly: true,
                    position: 'sidebar',
                    condition: (data)=>Boolean(data?.ssoRoles)
                }
            }
        ];
        // Modify collections
        const collections = (config.collections || []).map((collection)=>{
            if (collection.slug !== userCollection) {
                return collection;
            }
            // Build the auth config with disableLocalStrategy if needed
            let authConfig = collection.auth;
            if (disableLocalStrategy) {
                if (authConfig === true) {
                    authConfig = {
                        disableLocalStrategy: true
                    };
                } else if (typeof authConfig === 'object') {
                    authConfig = {
                        ...authConfig,
                        disableLocalStrategy: true
                    };
                }
                // When disableLocalStrategy is true, Payload skips registering the
                // built-in 'local-jwt' auth strategy, which breaks cookie-based
                // authentication entirely. We must inject the JWT strategy ourselves.
                if (typeof authConfig === 'object') {
                    const existing = authConfig.strategies || [];
                    authConfig = {
                        ...authConfig,
                        strategies: [
                            ...existing,
                            {
                                name: 'oauth-jwt',
                                authenticate: oauthJWTAuthenticate
                            }
                        ]
                    };
                }
            }
            return {
                ...collection,
                auth: authConfig,
                endpoints: [
                    ...collection.endpoints || [],
                    ...oauthEndpoints
                ],
                fields: [
                    ...collection.fields || [],
                    oauthAccountsField,
                    ...ssoFields
                ]
            };
        });
        // Check if user collection exists, if not add a basic one
        const hasUserCollection = collections.some((c)=>c.slug === userCollection);
        if (!hasUserCollection) {
            collections.push({
                slug: userCollection,
                auth: disableLocalStrategy ? {
                    disableLocalStrategy: true,
                    strategies: [
                        {
                            name: 'oauth-jwt',
                            authenticate: oauthJWTAuthenticate
                        }
                    ]
                } : true,
                endpoints: oauthEndpoints,
                fields: [
                    {
                        name: 'email',
                        type: 'email',
                        required: true,
                        unique: true
                    },
                    oauthAccountsField,
                    ...ssoFields
                ]
            });
        }
        // Setup admin components for login buttons
        if (!config.admin) {
            config.admin = {};
        }
        if (!config.admin.components) {
            config.admin.components = {};
        }
        if (!config.admin.components.afterLogin) {
            config.admin.components.afterLogin = [];
        }
        config.admin.components.afterLogin.push('payload-auth-arctic/client#OAuthButtons');
        return {
            ...config,
            collections
        };
    };
/**
 * Find an existing user or create a new one
 */ async function findOrCreateUser(req, args) {
    const { provider, userInfo, userCollection, autoCreateUsers, pluginConfig } = args;
    // First, try to find by OAuth account (provider + providerId)
    const existingByOAuth = await req.payload.find({
        collection: userCollection,
        where: {
            and: [
                {
                    'oauthAccounts.provider': {
                        equals: provider
                    }
                },
                {
                    'oauthAccounts.providerId': {
                        equals: userInfo.providerId
                    }
                }
            ]
        },
        limit: 1
    });
    if (existingByOAuth.docs.length > 0) {
        const existingUser = existingByOAuth.docs[0];
        // Refresh providerData (ssoProfile, ssoGroups, ssoRoles) on every login
        if (userInfo.providerData && Object.keys(userInfo.providerData).length > 0) {
            const updated = await req.payload.update({
                collection: userCollection,
                id: existingUser.id,
                data: userInfo.providerData
            });
            return updated;
        }
        return existingUser;
    }
    // Try to find by email
    if (userInfo.email) {
        const existingByEmail = await req.payload.find({
            collection: userCollection,
            where: {
                email: {
                    equals: userInfo.email
                }
            },
            limit: 1
        });
        if (existingByEmail.docs.length > 0) {
            // Link OAuth account to existing user
            const existingUser = existingByEmail.docs[0];
            const oauthAccounts = existingUser.oauthAccounts || [];
            const updated = await req.payload.update({
                collection: userCollection,
                id: existingUser.id,
                data: {
                    oauthAccounts: [
                        ...oauthAccounts,
                        {
                            provider,
                            providerId: userInfo.providerId,
                            email: userInfo.email,
                            connectedAt: new Date().toISOString()
                        }
                    ],
                    ...userInfo.providerData || {}
                }
            });
            return updated;
        }
    }
    // Auto-create new user if enabled
    if (autoCreateUsers) {
        // Map user fields
        let userData;
        if (pluginConfig.mapUserFields) {
            userData = pluginConfig.mapUserFields(userInfo, provider);
        } else {
            userData = {
                email: userInfo.email,
                name: userInfo.name || userInfo.email?.split('@')[0]
            };
        }
        // Call beforeUserCreate hook if provided
        if (pluginConfig.beforeUserCreate) {
            userData = await pluginConfig.beforeUserCreate({
                userInfo,
                provider
            });
        }
        // Generate a random password for OAuth users (they won't use it)
        const { randomBytes } = await import('node:crypto');
        const randomPassword = randomBytes(32).toString('base64url');
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
                        connectedAt: new Date().toISOString()
                    }
                ],
                ...userInfo.providerData || {}
            }
        });
        return newUser;
    }
    return null;
}

//# sourceMappingURL=plugin.js.map