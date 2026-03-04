/**
 * Fetch user profile from Microsoft Graph
 */ export async function fetchGraphProfile(accessToken) {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    if (!response.ok) {
        throw new Error(`Graph profile fetch failed: ${response.status}`);
    }
    return response.json();
}
/**
 * Fetch group and role membership from Microsoft Graph
 */ export async function fetchGraphMemberOf(accessToken) {
    const groups = [];
    const roles = [];
    let nextUrl = 'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName';
    while(nextUrl){
        const response = await fetch(nextUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error(`Graph memberOf fetch failed: ${response.status}`);
        }
        const data = await response.json();
        for (const entry of data.value || []){
            const type = entry['@odata.type'] || '';
            if (type.toLowerCase().includes('group')) {
                groups.push({
                    id: entry.id,
                    displayName: entry.displayName
                });
            } else if (type.toLowerCase().includes('directoryrole')) {
                roles.push({
                    id: entry.id,
                    displayName: entry.displayName
                });
            }
        }
        nextUrl = data['@odata.nextLink'];
    }
    return {
        groups,
        roles
    };
}

//# sourceMappingURL=graph.js.map