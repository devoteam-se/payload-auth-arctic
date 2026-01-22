'use client'

import { useState } from 'react'

export const AfterLogin = () => {
  const [loading, setLoading] = useState(false)

  const handleClick = () => {
    setLoading(true)
    window.location.href = '/api/users/sso/authorize'
  }

  return (
    <div style={{ marginTop: '24px' }}>
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

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
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
          cursor: loading ? 'wait' : 'pointer',
          fontSize: '14px',
          fontFamily: 'inherit',
          color: 'var(--theme-elevation-800)',
          transition: 'background 0.15s ease',
        }}
        onMouseOver={(e) => {
          if (!loading) {
            e.currentTarget.style.background = 'var(--theme-elevation-100)'
          }
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'var(--theme-elevation-50)'
        }}
      >
        {/* Microsoft Logo */}
        <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        {loading ? 'Redirecting...' : 'Sign in with Microsoft'}
      </button>
    </div>
  )
}
