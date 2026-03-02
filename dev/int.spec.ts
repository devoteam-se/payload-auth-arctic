import type { Payload } from 'payload'

import config from '@payload-config'
import {
  generatePayloadCookie,
  getPayload,
  handleEndpoints,
  jwtSign,
} from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload

afterAll(async () => {
  // Payload v3 doesn't expose a destroy method; DB cleanup is handled by MongoMemoryReplSet
})

beforeAll(async () => {
  payload = await getPayload({ config })
})

describe('OAuth plugin - JWT strategy', () => {
  test('registers oauth-jwt auth strategy when disableLocalStrategy is true', () => {
    const strategyNames = payload.authStrategies.map((s) => s.name)
    expect(strategyNames).toContain('oauth-jwt')
  })

  test('does not register the default local-jwt strategy when disableLocalStrategy is true', () => {
    const strategyNames = payload.authStrategies.map((s) => s.name)
    expect(strategyNames).not.toContain('local-jwt')
  })

  test('users collection exists with auth enabled', () => {
    expect(payload.collections['users']).toBeDefined()
    expect(payload.collections['users'].config.auth).toBeTruthy()
  })

  test('users collection has OAuth endpoints registered', () => {
    const endpoints = payload.collections['users'].config.endpoints
    expect(endpoints).toBeDefined()

    const endpointPaths = (endpoints as { path: string }[]).map((e) => e.path)
    expect(endpointPaths).toContain('/oauth/entra')
    expect(endpointPaths).toContain('/oauth/entra/callback')
    expect(endpointPaths).toContain('/oauth/providers')
  })

  test('users collection has oauthAccounts field', () => {
    const fieldNames = payload.collections['users'].config.fields.map(
      (f) => 'name' in f && f.name,
    )
    expect(fieldNames).toContain('oauthAccounts')
  })
})

describe('OAuth plugin - cookie-based authentication', () => {
  let testUser: Record<string, unknown>

  beforeAll(async () => {
    // Create a test user via Payload API (bypasses local strategy)
    testUser = (await payload.create({
      collection: 'users',
      data: {
        email: 'oauth-test@example.com',
        password: 'not-used-but-required',
        oauthAccounts: [
          {
            provider: 'entra',
            providerId: 'test-provider-id-123',
            email: 'oauth-test@example.com',
            connectedAt: new Date().toISOString(),
          },
        ],
      },
    })) as Record<string, unknown>
  })

  test('JWT token signed with Payload secret can authenticate a user', async () => {
    const collectionConfig = payload.collections['users'].config
    const authConfig = collectionConfig.auth as Record<string, unknown>
    const tokenExpiration = (authConfig.tokenExpiration as number) || 7200

    // Sign a JWT the same way the OAuth callback does
    const { token } = await jwtSign({
      fieldsToSign: {
        id: testUser.id,
        collection: 'users',
        email: testUser.email,
      },
      secret: payload.secret,
      tokenExpiration,
    })

    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')

    // Generate the cookie string
    const cookiePrefix = payload.config.cookiePrefix || 'payload'
    const cookie = generatePayloadCookie({
      collectionAuthConfig: authConfig,
      cookiePrefix,
      token,
    })

    expect(cookie).toContain(`${cookiePrefix}-token=`)
    expect(cookie).toContain('Path=/')

    // Use the cookie to call /api/users/me and verify authentication works
    const meRequest = new Request('http://localhost:3000/api/users/me', {
      method: 'GET',
      headers: {
        Cookie: cookie,
      },
    })

    const meResponse = await handleEndpoints({ config, request: meRequest })
    expect(meResponse.status).toBe(200)

    const meData = await meResponse.json()
    expect(meData.user).toBeTruthy()
    expect(meData.user.id).toBe(testUser.id)
    expect(meData.user.email).toBe('oauth-test@example.com')
  })

  test('request without cookie returns no user', async () => {
    const meRequest = new Request('http://localhost:3000/api/users/me', {
      method: 'GET',
    })

    const meResponse = await handleEndpoints({ config, request: meRequest })
    expect(meResponse.status).toBe(200)

    const meData = await meResponse.json()
    expect(meData.user).toBeNull()
  })

  test('request with invalid token returns no user', async () => {
    const meRequest = new Request('http://localhost:3000/api/users/me', {
      method: 'GET',
      headers: {
        Cookie: 'payload-token=invalid.jwt.token',
      },
    })

    const meResponse = await handleEndpoints({ config, request: meRequest })
    expect(meResponse.status).toBe(200)

    const meData = await meResponse.json()
    expect(meData.user).toBeNull()
  })

  test('providers endpoint returns entra provider info', async () => {
    const providersRequest = new Request(
      'http://localhost:3000/api/users/oauth/providers',
      { method: 'GET' },
    )

    const providersResponse = await handleEndpoints({ config, request: providersRequest })
    expect(providersResponse.status).toBe(200)

    const data = await providersResponse.json()
    expect(data.providers).toBeDefined()
    expect(data.providers).toHaveLength(1)
    expect(data.providers[0].key).toBe('entra')
    expect(data.providers[0].displayName).toBe('Microsoft')
    expect(data.disableLocalStrategy).toBe(true)
  })
})
