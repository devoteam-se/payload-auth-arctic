/**
 * Construct an OAuth login URL with an optional returnTo parameter.
 *
 * @param authorizePath - The provider's authorize path (e.g. `/api/users/oauth/entra`)
 * @param returnTo - URL to redirect to after login (defaults to the plugin's successRedirect)
 */
export declare function getOAuthLoginUrl(authorizePath: string, returnTo?: string): string;
