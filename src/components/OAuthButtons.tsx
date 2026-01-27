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
  google: (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  ),
  github: (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
        fill="currentColor"
      />
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
