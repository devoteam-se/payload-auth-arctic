'use client';
import { useEffect, useState } from 'react';
import { getOAuthLoginUrl } from '../utils/oauth.js';
export function useOAuthProviders(options) {
    const userCollection = options?.userCollection ?? 'users';
    const [providers, setProviders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [disableLocalStrategy, setDisableLocalStrategy] = useState(false);
    useEffect(()=>{
        setIsLoading(true);
        fetch(`/api/${userCollection}/oauth/providers`).then((res)=>{
            if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
            return res.json();
        }).then((data)=>{
            if (Array.isArray(data)) {
                setProviders(data);
                setDisableLocalStrategy(false);
            } else {
                setProviders(data.providers);
                setDisableLocalStrategy(Boolean(data.disableLocalStrategy));
            }
            setError(null);
        }).catch((err)=>{
            console.error('Failed to load OAuth providers:', err);
            setError(err instanceof Error ? err : new Error(String(err)));
        }).finally(()=>setIsLoading(false));
    }, [
        userCollection
    ]);
    const getLoginUrl = (provider, returnTo)=>getOAuthLoginUrl(provider.authorizePath, returnTo);
    const login = (provider, returnTo)=>{
        window.location.href = getLoginUrl(provider, returnTo);
    };
    return {
        providers,
        isLoading,
        error,
        disableLocalStrategy,
        getLoginUrl,
        login
    };
}

//# sourceMappingURL=useOAuthProviders.js.map