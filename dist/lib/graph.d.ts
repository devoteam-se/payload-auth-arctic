export interface GraphProfile extends Record<string, unknown> {
    department?: string;
    displayName?: string;
    givenName?: string;
    id?: string;
    jobTitle?: string;
    mail?: string;
    surname?: string;
    userPrincipalName?: string;
}
export interface GraphGroup {
    displayName?: string;
    id: string;
}
export interface GraphRole {
    displayName?: string;
    id: string;
}
/**
 * Fetch user profile from Microsoft Graph
 */
export declare function fetchGraphProfile(accessToken: string): Promise<GraphProfile>;
/**
 * Fetch group and role membership from Microsoft Graph
 */
export declare function fetchGraphMemberOf(accessToken: string): Promise<{
    groups: GraphGroup[];
    roles: GraphRole[];
}>;
