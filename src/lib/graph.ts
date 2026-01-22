export interface GraphProfile extends Record<string, unknown> {
  department?: string
  displayName?: string
  givenName?: string
  id?: string
  jobTitle?: string
  mail?: string
  surname?: string
  userPrincipalName?: string
}

export interface GraphGroup {
  displayName?: string
  id: string
}

export interface GraphRole {
  displayName?: string
  id: string
}

interface GraphMemberOfResponse {
  '@odata.nextLink'?: string
  value: Array<{
    '@odata.type'?: string
    displayName?: string
    id: string
  }>
}

/**
 * Fetch user profile from Microsoft Graph
 */
export async function fetchGraphProfile(accessToken: string): Promise<GraphProfile> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Graph profile fetch failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Fetch group and role membership from Microsoft Graph
 */
export async function fetchGraphMemberOf(accessToken: string): Promise<{
  groups: GraphGroup[]
  roles: GraphRole[]
}> {
  const groups: GraphGroup[] = []
  const roles: GraphRole[] = []

  let nextUrl: string | undefined =
    'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName'

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Graph memberOf fetch failed: ${response.status}`)
    }

    const data: GraphMemberOfResponse = await response.json()

    for (const entry of data.value || []) {
      const type = entry['@odata.type'] || ''
      if (type.toLowerCase().includes('group')) {
        groups.push({ id: entry.id, displayName: entry.displayName })
      } else if (type.toLowerCase().includes('directoryrole')) {
        roles.push({ id: entry.id, displayName: entry.displayName })
      }
    }

    nextUrl = data['@odata.nextLink']
  }

  return { groups, roles }
}
