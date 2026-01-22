import { randomBytes, createHash } from 'node:crypto'

/**
 * Generate a cryptographically random code verifier for PKCE
 * Returns a 64-character base64url encoded string
 */
export function generateCodeVerifier(): string {
  return randomBytes(48).toString('base64url')
}

/**
 * Generate a code challenge from a code verifier using S256 method
 * @param verifier - The code verifier to hash
 * @returns Base64url encoded SHA256 hash
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest()
  return hash.toString('base64url')
}

/**
 * Generate a cryptographically random state parameter for CSRF protection
 * Returns a 32-character hex string
 */
export function generateState(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Generate a cryptographically random nonce for token replay protection
 * Returns a 32-character base64url encoded string
 *
 * The nonce is sent in the authorization request and must be present
 * in the ID token. This prevents token replay attacks.
 */
export function generateNonce(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Generate both code verifier and challenge for PKCE
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = generateCodeVerifier()
  const challenge = generateCodeChallenge(verifier)
  return { verifier, challenge }
}
