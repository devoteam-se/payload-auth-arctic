'use client'

import { useEffect, useState } from 'react'
import type { ProviderButtonInfo } from '../providers/types.js'
import { getOAuthLoginUrl } from '../utils/oauth.js'

type ProvidersResponse = {
  providers: ProviderButtonInfo[]
  disableLocalStrategy?: boolean
}

export function useOAuthProviders(options?: { userCollection?: string }) {
  const userCollection = options?.userCollection ?? 'users'
  const [providers, setProviders] = useState<ProviderButtonInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [disableLocalStrategy, setDisableLocalStrategy] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/${userCollection}/oauth/providers`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`)
        return res.json()
      })
      .then((data: ProvidersResponse | ProviderButtonInfo[]) => {
        if (Array.isArray(data)) {
          setProviders(data)
          setDisableLocalStrategy(false)
        } else {
          setProviders(data.providers)
          setDisableLocalStrategy(Boolean(data.disableLocalStrategy))
        }
        setError(null)
      })
      .catch((err) => {
        console.error('Failed to load OAuth providers:', err)
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => setIsLoading(false))
  }, [userCollection])

  const getLoginUrl = (provider: ProviderButtonInfo, returnTo?: string) =>
    getOAuthLoginUrl(provider.authorizePath, returnTo)

  const login = (provider: ProviderButtonInfo, returnTo?: string) => {
    window.location.href = getLoginUrl(provider, returnTo)
  }

  return { providers, isLoading, error, disableLocalStrategy, getLoginUrl, login }
}
