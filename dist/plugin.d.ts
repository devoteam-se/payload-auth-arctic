import type { Config } from 'payload';
import type { ArcticOAuthPluginConfig } from './providers/types.js';
export { entraProvider, type EntraProviderConfig } from './providers/entra.js';
export type { ArcticOAuthPluginConfig, OAuthProvider, OAuthUserInfo, OAuthAccount, ProviderButtonInfo, } from './providers/types.js';
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
export declare const arcticOAuthPlugin: (pluginConfig: ArcticOAuthPluginConfig) => (config: Config) => Config;
