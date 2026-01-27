'use client'

import { useSearchParams } from 'next/navigation'

export default function AuthTestPage() {
  const searchParams = useSearchParams()

  const token = searchParams.get('token')
  const userId = searchParams.get('user_id')
  const expiresIn = searchParams.get('expires_in')
  const error = searchParams.get('error')

  return (
    <div style={{ padding: '40px', fontFamily: 'monospace', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🔐 Mobile Auth Test Page</h1>
      <p>This page simulates what an Expo app would receive after OAuth authentication.</p>
      
      <hr style={{ margin: '20px 0' }} />

      {error ? (
        <div style={{ background: '#fee', padding: '20px', borderRadius: '8px' }}>
          <h2>❌ Error</h2>
          <pre>{error}</pre>
        </div>
      ) : token ? (
        <div style={{ background: '#efe', padding: '20px', borderRadius: '8px' }}>
          <h2>✅ Authentication Successful!</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '10px', fontWeight: 'bold' }}>User ID:</td>
                <td style={{ padding: '10px' }}>{userId}</td>
              </tr>
              <tr>
                <td style={{ padding: '10px', fontWeight: 'bold' }}>Expires In:</td>
                <td style={{ padding: '10px' }}>{expiresIn} seconds</td>
              </tr>
              <tr>
                <td style={{ padding: '10px', fontWeight: 'bold' }}>Token:</td>
                <td style={{ padding: '10px', wordBreak: 'break-all' }}>
                  <code style={{ fontSize: '12px' }}>{token}</code>
                </td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: '30px' }}>Test the token:</h3>
          <pre style={{ background: '#333', color: '#0f0', padding: '15px', borderRadius: '4px', overflow: 'auto' }}>
{`curl -H "Authorization: JWT ${token}" \\
  http://localhost:3000/api/users/me`}
          </pre>
        </div>
      ) : (
        <div style={{ background: '#eef', padding: '20px', borderRadius: '8px' }}>
          <h2>🧪 How to Test</h2>
          <p>Click one of the links below to start the OAuth flow with mobile mode:</p>
          <ul style={{ lineHeight: '2' }}>
            <li>
              <a href="/api/users/oauth/google?redirect_uri=http://localhost:3000/auth-test">
                Sign in with Google (mobile mode)
              </a>
            </li>
            <li>
              <a href="/api/users/oauth/entra?redirect_uri=http://localhost:3000/auth-test">
                Sign in with Microsoft (mobile mode)
              </a>
            </li>
          </ul>
          
          <h3 style={{ marginTop: '30px' }}>What this simulates:</h3>
          <p>
            In Expo, <code>AuthSession.openAuthSessionAsync()</code> would open a web browser 
            to the OAuth URL, and after authentication, redirect back to your app with the token 
            in the URL parameters.
          </p>
        </div>
      )}
    </div>
  )
}
