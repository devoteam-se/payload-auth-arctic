import type { OIDCClaims, TokenResponse, TokenValidationOptions } from '../types.js'

import {
  getEntraJwksUri,
  getSigningKey,
  getTokenKid,
  jwkToPem,
  verifyRS256Signature,
} from './jwks.js'

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(params: {
  clientId: string
  clientSecret: string
  code: string
  codeVerifier: string
  redirectUri: string
  tenantId: string
}): Promise<TokenResponse> {
  const { clientId, clientSecret, code, codeVerifier, redirectUri, tenantId } = params

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

  const response = await fetch(tokenUrl, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const errorBody = await response.text()
    let errorMessage: string
    try {
      const errorJson = JSON.parse(errorBody)
      errorMessage = errorJson.error_description || errorJson.error || 'Token exchange failed'
    } catch {
      errorMessage = `Token exchange failed: ${response.status}`
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

/**
 * Decode JWT token payload without signature verification
 */
export function decodeIdToken(idToken: string): OIDCClaims {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const payload = parts[1]
  // Add padding if needed for base64 decoding
  const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4)

  try {
    const decoded = Buffer.from(paddedPayload, 'base64url').toString('utf-8')
    return JSON.parse(decoded)
  } catch {
    throw new Error('Failed to decode ID token')
  }
}

/**
 * Validate and decode ID token with full security checks
 *
 * Performs:
 * - JWT signature verification using JWKS
 * - Issuer (iss) validation
 * - Audience (aud) validation
 * - Tenant ID (tid) validation (Entra-specific)
 * - Token expiry (exp) validation
 * - Nonce validation (if provided)
 */
export async function validateAndDecodeIdToken(
  idToken: string,
  options: TokenValidationOptions,
): Promise<OIDCClaims> {
  const { clientId, clockTolerance = 60, expectedNonce, tenantId } = options

  // 1. Decode the token first to get claims
  const claims = decodeIdToken(idToken)

  // 2. Validate signature using JWKS
  const kid = getTokenKid(idToken)
  const jwksUri = getEntraJwksUri(tenantId)
  const signingKey = await getSigningKey(jwksUri, kid)
  const publicKeyPem = jwkToPem(signingKey)

  const isValid = verifyRS256Signature(idToken, publicKeyPem)
  if (!isValid) {
    throw new Error('Invalid token signature')
  }

  // 3. Validate issuer (iss)
  // Entra v2.0 issuer format: https://login.microsoftonline.com/{tenant}/v2.0
  const expectedIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`
  if (claims.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer: expected ${expectedIssuer}, got ${claims.iss}`)
  }

  // 4. Validate audience (aud)
  if (claims.aud !== clientId) {
    throw new Error(`Invalid audience: expected ${clientId}, got ${claims.aud}`)
  }

  // 5. Validate tenant ID (tid) - Entra-specific
  if (claims.tid !== tenantId) {
    throw new Error(`Invalid tenant: expected ${tenantId}, got ${claims.tid}`)
  }

  // 6. Validate token expiry (exp)
  const now = Math.floor(Date.now() / 1000)
  if (claims.exp && claims.exp < now - clockTolerance) {
    throw new Error('Token has expired')
  }

  // 7. Validate not before (nbf) if present
  if (claims.nbf && claims.nbf > now + clockTolerance) {
    throw new Error('Token is not yet valid')
  }

  // 8. Validate nonce if provided
  if (expectedNonce && claims.nonce !== expectedNonce) {
    throw new Error(`Invalid nonce: expected ${expectedNonce}, got ${claims.nonce}`)
  }

  return claims
}
