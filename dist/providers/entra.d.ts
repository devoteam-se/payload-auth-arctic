import type { OAuthProvider } from './types.js';
/**
 * Microsoft Entra ID (Azure AD) provider configuration
 */
export interface EntraProviderConfig {
    /** Application (client) ID */
    clientId: string;
    /** Client secret */
    clientSecret: string;
    /** Azure AD Tenant ID (GUID or domain) */
    tenantId: string;
    /**
     * Additional scopes beyond 'openid profile email'
     * Note: 'User.Read' is always included for MS Graph profile fetch
     */
    scopes?: string[];
    /**
     * Microsoft Graph API features to enable.
     * When enabled, the provider fetches additional data and adds required scopes automatically.
     */
    graph?: {
        /** Fetch full /me profile from Graph */
        profile?: boolean;
        /** Fetch /me/memberOf groups (adds GroupMember.Read.All scope) */
        groups?: boolean;
        /** Fetch /me/memberOf directory roles (adds Directory.Read.All scope) */
        roles?: boolean;
    };
    /**
     * Entra login prompt behavior
     * @default 'select_account'
     */
    prompt?: 'select_account' | 'login' | 'consent' | 'none';
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
export declare function entraProvider(config: EntraProviderConfig): OAuthProvider;
