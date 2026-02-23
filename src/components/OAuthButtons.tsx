'use client'

import { useEffect, useState } from 'react'
import type { ProviderButtonInfo } from '../providers/types.js'

/**
 * Provider icons - add more as needed
 */
const providerIcons: Record<string, React.ReactNode> = {
  entra: (
    <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  ),
}

/**
 * Default icon for providers without a specific icon
 */
const defaultIcon = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
)

type ProvidersResponse = {
  providers: ProviderButtonInfo[]
  disableLocalStrategy?: boolean
}

export const OAuthButtons = () => {
  const [providers, setProviders] = useState<ProviderButtonInfo[]>([])
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const [disableLocalStrategy, setDisableLocalStrategy] = useState<boolean>(false)

  useEffect(() => {
    // Fetch available providers from the API
    fetch('/api/users/oauth/providers')
      .then((res) => res.json())
      .then((data: ProvidersResponse | ProviderButtonInfo[]) => {
        if (Array.isArray(data)) {
          setProviders(data)
          setDisableLocalStrategy(false)
          return
        }

        setProviders(data.providers)
        setDisableLocalStrategy(Boolean(data.disableLocalStrategy))
      })
      .catch((err) => console.error('Failed to load OAuth providers:', err))
  }, [])

  const handleClick = (provider: ProviderButtonInfo) => {
    setLoadingProvider(provider.key)
    window.location.href = provider.authorizePath
  }

  if (providers.length === 0) {
    return null
  }

  return (
    <div style={{ marginTop: '24px' }}>
      {!disableLocalStrategy && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '16px 0',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'var(--theme-elevation-150)' }} />
          <span style={{ color: 'var(--theme-elevation-400)', fontSize: '13px' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--theme-elevation-150)' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {providers.map((provider) => (
          <button
            key={provider.key}
            type="button"
            onClick={() => handleClick(provider)}
            disabled={loadingProvider !== null}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px 16px',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: '4px',
              background: 'var(--theme-elevation-50)',
              cursor: loadingProvider !== null ? 'wait' : 'pointer',
              fontSize: '14px',
              fontFamily: 'inherit',
              color: 'var(--theme-elevation-800)',
              transition: 'background 0.15s ease',
              opacity: loadingProvider !== null && loadingProvider !== provider.key ? 0.6 : 1,
            }}
            onMouseOver={(e) => {
              if (loadingProvider === null) {
                e.currentTarget.style.background = 'var(--theme-elevation-100)'
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'var(--theme-elevation-50)'
            }}
          >
            {providerIcons[provider.key] || defaultIcon}
            {loadingProvider === provider.key
              ? 'Redirecting...'
              : `Sign in with ${provider.displayName}`}
          </button>
        ))}
      </div>
    </div>
  )
}
