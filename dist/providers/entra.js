import { MicrosoftEntraId } from 'arctic';
import { fetchGraphProfile, fetchGraphMemberOf } from '../lib/graph.js';
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
 */ export function entraProvider(config) {
    const graphConfig = config.graph || {};
    const prompt = config.prompt ?? 'select_account';
    // Build scopes dynamically based on graph config
    const scopes = [
        'openid',
        'profile',
        'email',
        'User.Read'
    ];
    if (graphConfig.groups) {
        scopes.push('GroupMember.Read.All');
    }
    if (graphConfig.roles) {
        scopes.push('Directory.Read.All');
    }
    if (config.scopes) {
        scopes.push(...config.scopes);
    }
    const needsGraph = graphConfig.profile || graphConfig.groups || graphConfig.roles;
    return {
        name: 'entra',
        displayName: 'Microsoft',
        defaultScopes: scopes,
        createClient (redirectUri) {
            return new MicrosoftEntraId(config.tenantId, config.clientId, config.clientSecret, redirectUri);
        },
        modifyAuthorizationURL (url) {
            url.searchParams.set('prompt', prompt);
            return url;
        },
        async getUserInfo (tokens) {
            const accessToken = tokens.accessToken();
            // Always fetch basic profile
            const profile = await fetchGraphProfile(accessToken);
            const providerData = {};
            if (needsGraph) {
                if (graphConfig.profile) {
                    providerData.ssoProfile = profile;
                }
                if (graphConfig.groups || graphConfig.roles) {
                    const memberOf = await fetchGraphMemberOf(accessToken);
                    if (graphConfig.groups) {
                        providerData.ssoGroups = memberOf.groups;
                    }
                    if (graphConfig.roles) {
                        providerData.ssoRoles = memberOf.roles;
                    }
                }
            }
            return {
                providerId: profile.id,
                email: profile.mail || profile.userPrincipalName,
                name: profile.displayName,
                firstName: profile.givenName,
                lastName: profile.surname,
                rawClaims: profile,
                ...Object.keys(providerData).length > 0 ? {
                    providerData
                } : {}
            };
        }
    };
}

//# sourceMappingURL=entra.js.map