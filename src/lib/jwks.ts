import { createVerify } from 'node:crypto'

/**
 * JSON Web Key (JWK) structure for RSA keys
 */
export interface JWK {
  alg?: string // Algorithm (RS256)
  e: string // RSA exponent
  kid: string // Key ID
  kty: string // Key type (RSA)
  n: string // RSA modulus
  use?: string // Key use (sig)
  x5c?: string[] // X.509 certificate chain
  x5t?: string // X.509 thumbprint
}

/**
 * JWKS (JSON Web Key Set) structure
 */
export interface JWKS {
  keys: JWK[]
}

/**
 * Cached JWKS with expiration
 */
interface CachedJWKS {
  expiresAt: number
  keys: Map<string, JWK>
}

// In-memory cache for JWKS, keyed by issuer URL
const jwksCache = new Map<string, CachedJWKS>()

// Cache TTL: 24 hours (JWKS don't change frequently)
const JWKS_CACHE_TTL = 24 * 60 * 60 * 1000

/**
 * Get the JWKS URI for a Microsoft Entra tenant
 */
export function getEntraJwksUri(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
}

/**
 * Fetch JWKS from the discovery endpoint with caching
 */
export async function fetchJWKS(jwksUri: string, forceRefresh = false): Promise<Map<string, JWK>> {
  const cached = jwksCache.get(jwksUri)

  // Return cached if valid and not forcing refresh
  if (cached && !forceRefresh && Date.now() < cached.expiresAt) {
    return cached.keys
  }

  const response = await fetch(jwksUri, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`)
  }

  const jwks: JWKS = await response.json()

  // Build a map of kid -> JWK for quick lookup
  const keysMap = new Map<string, JWK>()
  for (const key of jwks.keys) {
    if (key.kid && key.kty === 'RSA') {
      keysMap.set(key.kid, key)
    }
  }

  // Cache the result
  jwksCache.set(jwksUri, {
    expiresAt: Date.now() + JWKS_CACHE_TTL,
    keys: keysMap,
  })

  return keysMap
}

/**
 * Get a specific key by kid from JWKS
 * Will refetch if key not found (key rotation scenario)
 */
export async function getSigningKey(jwksUri: string, kid: string): Promise<JWK> {
  // First try cached keys
  let keys = await fetchJWKS(jwksUri)
  let key = keys.get(kid)

  if (key) {
    return key
  }

  // Key not found - might be rotated, force refresh
  keys = await fetchJWKS(jwksUri, true)
  key = keys.get(kid)

  if (!key) {
    throw new Error(`Signing key not found: ${kid}`)
  }

  return key
}

/**
 * Convert base64url to base64
 */
function base64urlToBase64(base64url: string): string {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding
  while (base64.length % 4) {
    base64 += '='
  }
  return base64
}

/**
 * Build PEM public key from JWK RSA components
 */
export function jwkToPem(jwk: JWK): string {
  if (jwk.kty !== 'RSA') {
    throw new Error(`Unsupported key type: ${jwk.kty}`)
  }

  // If x5c is available, use the first certificate
  if (jwk.x5c && jwk.x5c.length > 0) {
    const cert = jwk.x5c[0]
    return `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`
  }

  // Otherwise, construct from n and e
  const n = Buffer.from(base64urlToBase64(jwk.n), 'base64')
  const e = Buffer.from(base64urlToBase64(jwk.e), 'base64')

  // Build ASN.1 DER encoding for RSA public key
  const nBytes = encodeLength(n.length)
  const eBytes = encodeLength(e.length)

  // RSAPublicKey ::= SEQUENCE { modulus INTEGER, exponent INTEGER }
  const modulusInt = Buffer.concat([Buffer.from([0x02]), nBytes, ensurePositive(n)])
  const exponentInt = Buffer.concat([Buffer.from([0x02]), eBytes, ensurePositive(e)])

  const rsaPublicKey = Buffer.concat([
    Buffer.from([0x30]), // SEQUENCE
    encodeLength(modulusInt.length + exponentInt.length),
    modulusInt,
    exponentInt,
  ])

  // SubjectPublicKeyInfo with RSA OID
  const rsaOid = Buffer.from([
    0x30,
    0x0d, // SEQUENCE
    0x06,
    0x09, // OID
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01, // rsaEncryption
    0x05,
    0x00, // NULL
  ])

  const bitString = Buffer.concat([
    Buffer.from([0x03]), // BIT STRING
    encodeLength(rsaPublicKey.length + 1),
    Buffer.from([0x00]), // No unused bits
    rsaPublicKey,
  ])

  const spki = Buffer.concat([
    Buffer.from([0x30]), // SEQUENCE
    encodeLength(rsaOid.length + bitString.length),
    rsaOid,
    bitString,
  ])

  const base64 = spki.toString('base64')
  return `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`
}

/**
 * Encode ASN.1 length
 */
function encodeLength(length: number): Buffer {
  if (length < 128) {
    return Buffer.from([length])
  }
  const bytes: number[] = []
  let temp = length
  while (temp > 0) {
    bytes.unshift(temp & 0xff)
    temp >>= 8
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

/**
 * Ensure integer is positive (add leading 0x00 if high bit set)
 */
function ensurePositive(buf: Buffer): Buffer {
  if (buf[0] & 0x80) {
    return Buffer.concat([Buffer.from([0x00]), buf])
  }
  return buf
}

/**
 * Verify RS256 JWT signature
 */
export function verifyRS256Signature(token: string, publicKeyPem: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const [header, payload, signature] = parts
  const signatureInput = `${header}.${payload}`

  // Convert base64url signature to Buffer
  const signatureBuffer = Buffer.from(base64urlToBase64(signature), 'base64')

  const verifier = createVerify('RSA-SHA256')
  verifier.update(signatureInput)

  return verifier.verify(publicKeyPem, signatureBuffer)
}

/**
 * Extract kid from JWT header
 */
export function getTokenKid(token: string): string {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const headerJson = Buffer.from(base64urlToBase64(parts[0]), 'base64').toString('utf-8')
  const header = JSON.parse(headerJson)

  if (!header.kid) {
    throw new Error('No kid in JWT header')
  }

  return header.kid
}

/**
 * Clear JWKS cache (useful for testing)
 */
export function clearJWKSCache(): void {
  jwksCache.clear()
}
