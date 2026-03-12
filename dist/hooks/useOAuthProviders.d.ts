import type { ProviderButtonInfo } from '../providers/types.js';
export declare function useOAuthProviders(options?: {
    userCollection?: string;
}): {
    providers: ProviderButtonInfo[];
    isLoading: boolean;
    error: Error | null;
    disableLocalStrategy: boolean;
    getLoginUrl: (provider: ProviderButtonInfo, returnTo?: string) => string;
    login: (provider: ProviderButtonInfo, returnTo?: string) => void;
};
