import SQLiteDAO from './SQLiteDAO';
import { schemaConfigurations } from './schemas';
/**
 * @description A record to hold active database connections (DAOs).
 * The key is the database name (e.g., 'core', 'analytics'), and the value is the connected DAO instance.
 */
export type DatabaseConnections = {
    [key: string]: SQLiteDAO;
};
/**
 * @description Configuration for role-based database access
 */
export interface RoleConfig {
    roleName: string;
    requiredDatabases: string[];
    optionalDatabases?: string[];
    priority?: number;
}
/**
 * @description Role configuration registry - this is the parent set that defines what databases each role can access
 */
export type RoleRegistry = {
    [roleName: string]: RoleConfig;
};
/**
 * @class DatabaseManager
 * @description A singleton-like manager to handle the initialization and retrieval of all databases
 * with role-based connection management. RoleRegistry is the parent set that defines database access permissions,
 * while connections is the child set that manages actual active connections.
 */
export declare class DatabaseManager {
    private static appStateListener;
    private static maxConnections;
    private static connections;
    private static isInitialized;
    private static roleRegistry;
    private static currentRole;
    private static currentUserRoles;
    /**
     * Register a role configuration in the parent registry
     * @param roleConfig Role configuration object
     */
    static registerRole(roleConfig: RoleConfig): void;
    /**
     * Register multiple roles at once
     * @param roleConfigs Array of role configurations
     */
    static registerRoles(roleConfigs: RoleConfig[]): void;
    /**
     * Get registered roles from the parent registry
     * @returns Object containing all registered roles
     */
    static getRegisteredRoles(): RoleRegistry;
    /**
     * Get databases that a specific role can access
     * @param roleName Role name
     * @returns Array of database keys the role can access
     */
    static getRoleDatabases(roleName: string): string[];
    /**
     * Get all databases that current user's roles can access
     * @returns Array of unique database keys
     */
    static getCurrentUserDatabases(): string[];
    /**
     * Initialize core database connection (always required)
     * @returns Promise that resolves when core database is connected
     */
    static initializeCoreConnection(): Promise<void>;
    /**
     * Set current user roles after login
     * @param userRoles Array of role names for the current user
     * @param primaryRole Primary role name (optional)
     */
    static setCurrentUserRoles(userRoles: string[], primaryRole?: string): Promise<void>;
    /**
     * Get current user roles
     * @returns Array of current user role names
     */
    static getCurrentUserRoles(): string[];
    /**
     * Get current primary role
     * @returns Current primary role name or null if none is set
     */
    static getCurrentRole(): string | null;
    /**
     * Initialize database connections for current user's roles
     */
    private static initializeUserRoleConnections;
    /**
     * Clean up database connections that are no longer needed
     * @param previousRoles Previous user roles
     */
    private static cleanupUnusedConnections;
    /**
     * Check if current user has access to a specific database
     * @param dbKey Database key
     * @returns True if user has access, false otherwise
     */
    static hasAccessToDatabase(dbKey: string): boolean;
    /**
     * Get a database connection with role-based access control
     * @param key Database key
     * @returns SQLiteDAO instance
     */
    static get(key: keyof typeof schemaConfigurations): SQLiteDAO;
    /**
     * Setup AppState listener with role-aware connection management
     */
    private static setupAppStateListener;
    /**
     * Close all active database connections
     */
    private static closeAllConnections;
    /**
     * Reopen connections based on current user roles
     */
    static reopenConnections(): Promise<void>;
    static getConnections(): DatabaseConnections;
    static debugDatabaseFiles(databaseKeys: string[]): Promise<void>;
    static openAllExisting(databaseKeys: string[]): Promise<boolean>;
    static initializeAll(): Promise<void>;
    static getLazyLoading(key: keyof typeof schemaConfigurations): Promise<SQLiteDAO>;
    static executeCrossSchemaTransaction(schemas: string[], callback: (daos: Record<string, SQLiteDAO>) => Promise<void>): Promise<void>;
    static closeAll(): Promise<void>;
    /**
     * Logout user and close role-specific connections
     */
    static logout(): Promise<void>;
}
export default DatabaseManager;
