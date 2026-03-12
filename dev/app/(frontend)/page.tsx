'use client'

import { useEffect, useState } from 'react'
import { useOAuthProviders } from 'payload-auth-arctic/client'

export default function FrontendPage() {
  const { providers, isLoading, error, login } = useOAuthProviders()
  const [user, setUser] = useState<{ email?: string } | null>(null)

  useEffect(() => {
    fetch('/api/users/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user)
      })
      .catch(() => {})
  }, [])

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Frontend Login Test</h1>
      <p>This page tests the <code>useOAuthProviders</code> hook with <code>returnTo</code>.</p>
      <p>After login you should be redirected back here (<code>/</code>), not <code>/admin</code>.</p>

      {isLoading && <p>Loading providers...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        {providers.map((provider) => (
          <button
            key={provider.key}
            type="button"
            onClick={() => !user && login(provider, '/')}
            disabled={!!user}
            style={{
              padding: '12px 16px',
              fontSize: 14,
              cursor: user ? 'default' : 'pointer',
              border: '1px solid #ccc',
              borderRadius: 4,
              background: user ? '#e6ffe6' : '#f5f5f5',
            }}
          >
            {user ? 'Logged in' : `Sign in with ${provider.displayName}`}
          </button>
        ))}
      </div>

      {user && (
        <p style={{ marginTop: 16, color: '#666' }}>
          Signed in as <strong>{user.email}</strong>
        </p>
      )}
    </div>
  )
}
