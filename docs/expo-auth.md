# Expo AuthSession Integration

This guide shows how to integrate `payload-auth-sso` with an Expo app using `expo-auth-session` for seamless mobile authentication.

## Overview

The Expo AuthSession flow works as follows:

1. Expo app opens a web browser to your Payload CMS OAuth endpoint
2. User authenticates via the OAuth provider (Google, Microsoft, etc.)
3. Payload redirects back to your Expo app with a JWT token
4. Expo parses the redirect URL and stores the token

## Payload CMS Configuration

### Enable Mobile Auth Mode

Update your Payload config to enable mobile authentication:

```typescript
import { buildConfig } from 'payload'
import { arcticOAuthPlugin, entraProvider, googleProvider } from 'payload-auth-sso'

export default buildConfig({
  // ... your config
  plugins: [
    arcticOAuthPlugin({
      providers: [
        entraProvider({
          clientId: process.env.ENTRA_CLIENT_ID!,
          clientSecret: process.env.ENTRA_CLIENT_SECRET!,
          tenantId: process.env.ENTRA_TENANT_ID!,
        }),
        googleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ],
      // Enable mobile app authentication
      enableMobileAuth: true,
      // Allow your Expo app's redirect URIs
      allowedMobileRedirectUris: [
        // Development (Expo Go)
        'exp://192.168.*',
        'exp://localhost:*',
        // Production (standalone app)
        'myapp://*',
        'com.mycompany.myapp://*',
      ],
    }),
  ],
})
```

### Allowed Redirect URI Patterns

The `allowedMobileRedirectUris` option supports wildcards for flexible URI matching:

| Pattern | Matches |
|---------|---------|
| `myapp://*` | `myapp://auth`, `myapp://callback?foo=bar` |
| `exp://192.168.*` | `exp://192.168.1.100:19000/--/auth` |
| `com.example.app://*` | `com.example.app://oauth/callback` |

## Expo App Setup

### 1. Install Dependencies

```bash
npx expo install expo-auth-session expo-crypto expo-web-browser expo-linking
```

### 2. Configure Deep Links

Add a scheme to your `app.json`:

```json
{
  "expo": {
    "scheme": "myapp",
    "ios": {
      "bundleIdentifier": "com.mycompany.myapp"
    },
    "android": {
      "package": "com.mycompany.myapp"
    }
  }
}
```

### 3. Create Auth Hook

```typescript
// hooks/usePayloadAuth.ts
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

// Required for web browser redirect to work properly
WebBrowser.maybeCompleteAuthSession();

const PAYLOAD_URL = 'https://your-payload-server.com';

interface AuthState {
  token: string | null;
  userId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface Provider {
  key: string;
  displayName: string;
  authorizePath: string;
}

export function usePayloadAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    userId: null,
    isLoading: true,
    error: null,
  });
  const [providers, setProviders] = useState<Provider[]>([]);

  // Create the redirect URI for your app
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'myapp',
    path: 'auth/callback',
  });

  // Fetch available providers on mount
  useEffect(() => {
    fetch(`${PAYLOAD_URL}/api/users/oauth/providers`)
      .then((res) => res.json())
      .then((data) => setProviders(data.providers || []))
      .catch((err) => console.error('Failed to fetch providers:', err));

    // Load stored token
    SecureStore.getItemAsync('payload_token').then((token) => {
      if (token) {
        setAuthState((prev) => ({ ...prev, token, isLoading: false }));
      } else {
        setAuthState((prev) => ({ ...prev, isLoading: false }));
      }
    });
  }, []);

  // Handle the OAuth response
  const handleAuthResponse = async (url: string) => {
    try {
      const parsedUrl = Linking.parse(url);
      const { token, user_id, expires_in, error } = parsedUrl.queryParams || {};

      if (error) {
        setAuthState((prev) => ({
          ...prev,
          error: error as string,
          isLoading: false,
        }));
        return;
      }

      if (token) {
        await SecureStore.setItemAsync('payload_token', token as string);
        setAuthState({
          token: token as string,
          userId: user_id as string,
          isLoading: false,
          error: null,
        });
      }
    } catch (err) {
      setAuthState((prev) => ({
        ...prev,
        error: 'Failed to parse auth response',
        isLoading: false,
      }));
    }
  };

  // Login function
  const login = async (providerKey: string) => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Build the OAuth URL with mobile redirect
      const authUrl = `${PAYLOAD_URL}/api/users/oauth/${providerKey}?redirect_uri=${encodeURIComponent(redirectUri)}`;

      // Open browser for authentication
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        await handleAuthResponse(result.url);
      } else if (result.type === 'cancel') {
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Authentication cancelled',
        }));
      }
    } catch (err) {
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Authentication failed',
      }));
    }
  };

  // Logout function
  const logout = async () => {
    await SecureStore.deleteItemAsync('payload_token');
    setAuthState({
      token: null,
      userId: null,
      isLoading: false,
      error: null,
    });
  };

  return {
    ...authState,
    providers,
    login,
    logout,
    redirectUri,
  };
}
```

### 4. Create Login Screen

```tsx
// screens/LoginScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { usePayloadAuth } from '../hooks/usePayloadAuth';

export function LoginScreen() {
  const { providers, login, isLoading, error } = usePayloadAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      
      {error && <Text style={styles.error}>{error}</Text>}
      
      {providers.map((provider) => (
        <TouchableOpacity
          key={provider.key}
          style={styles.button}
          onPress={() => login(provider.key)}
        >
          <Text style={styles.buttonText}>Sign in with {provider.displayName}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    marginVertical: 8,
    width: '100%',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  error: {
    color: 'red',
    marginBottom: 20,
  },
});
```

### 5. Use the Token in API Requests

```typescript
// utils/api.ts
import * as SecureStore from 'expo-secure-store';

const PAYLOAD_URL = 'https://your-payload-server.com';

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = await SecureStore.getItemAsync('payload_token');
  
  return fetch(`${PAYLOAD_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `JWT ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

// Example usage:
export async function getMe() {
  const response = await fetchWithAuth('/api/users/me');
  return response.json();
}

export async function getPosts() {
  const response = await fetchWithAuth('/api/posts');
  return response.json();
}
```

## Security Considerations

1. **HTTPS Required**: Always use HTTPS in production for your Payload server
2. **Validate Redirect URIs**: Only allow specific URI patterns in `allowedMobileRedirectUris`
3. **Token Storage**: Use `expo-secure-store` to securely store tokens
4. **Token Expiration**: Handle token refresh before expiration

## Troubleshooting

### "Invalid redirect URI" Error

Make sure your redirect URI pattern is in `allowedMobileRedirectUris`:

```typescript
// Debug: Log the redirect URI from your app
console.log('Redirect URI:', AuthSession.makeRedirectUri({ scheme: 'myapp' }));
```

### Browser Not Redirecting Back

1. Ensure `expo-web-browser` is properly installed
2. Call `WebBrowser.maybeCompleteAuthSession()` at the top of your auth component
3. Check that your app scheme is properly configured in `app.json`

### Token Not Being Set

Check that:
1. `enableMobileAuth: true` is set in your Payload config
2. The redirect URI matches an allowed pattern
3. The OAuth provider callback completes successfully

## Example App

See the [example Expo app](../examples/expo-auth-app) for a complete working implementation.
