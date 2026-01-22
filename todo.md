# SSO Plugin MVP - Implementation Todo

## Phase 1: Authorization Redirect
- [x] Create `src/types.ts` - Plugin configuration types
- [x] Create `src/lib/pkce.ts` - PKCE crypto utilities
- [x] Modify `src/index.ts` - Replace skeleton, add authorize endpoint
- [x] Update `dev/.env.example` - Add Entra env vars
- [x] Update `dev/payload.config.ts` - Configure plugin with Entra settings
- [x] Test: Verify redirect to Microsoft login works

## Phase 2: Callback and User Provisioning
- [x] Create `src/lib/tokens.ts` - Token exchange and ID token decoding
- [x] SSO fields integrated directly in `src/index.ts` (no separate file needed)
- [x] Modify `src/index.ts` - Add callback endpoint, modify users collection
- [x] Test: Complete login flow, verify user creation

## Phase 3: Login Button UI
- [x] Create `src/components/AfterLogin.tsx` - SSO button component
- [x] Modify `src/exports/client.ts` - Export AfterLogin component
- [x] Modify `src/index.ts` - Register afterLogin admin component
- [x] Test: Verify button appears on login page, end-to-end flow works

## Phase 4: Enterprise Entra Security (NEW)
- [x] Create `src/lib/jwks.ts` - JWKS fetching with caching
- [x] Add JWT RS256 signature verification using Microsoft JWKS
- [x] Add tenant ID (tid) claim validation
- [x] Add issuer (iss) claim validation
- [x] Add nonce generation and validation (replay protection)
- [x] Add token expiry (exp) and not-before (nbf) validation
- [x] Add `skipSignatureValidation` option for development
- [ ] Test: Verify full enterprise flow with signature validation

## Final Verification
- [x] End-to-end: Click button > Microsoft login > Payload admin (logged in)
- [x] Test with new user (JIT provisioning)
- [x] Test with existing user (account linking by email)
- [ ] Test enterprise security: token from wrong tenant is rejected
- [ ] Test enterprise security: expired token is rejected
- [ ] Test enterprise security: tampered token signature fails

## Build Status
- [x] TypeScript build passes (`pnpm build`)
