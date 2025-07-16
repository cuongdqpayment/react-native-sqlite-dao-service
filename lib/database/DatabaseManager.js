"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseManager = void 0;
const react_native_1 = require("react-native");
const react_native_fs_1 = __importDefault(require("react-native-fs"));
const DatabaseFactory_1 = require("./DatabaseFactory");
const schemas_1 = require("./schemas"); // Import the central schema registry
/**
 * @class DatabaseManager
 * @description A singleton-like manager to handle the initialization and retrieval of all databases
 * with role-based connection management. RoleRegistry is the parent set that defines database access permissions,
 * while connections is the child set that manages actual active connections.
 */
class DatabaseManager {
    /**
     * Register a role configuration in the parent registry
     * @param roleConfig Role configuration object
     */
    static registerRole(roleConfig) {
        this.roleRegistry[roleConfig.roleName] = roleConfig;
        console.log(`[DatabaseManager] Role '${roleConfig.roleName}' registered with databases: ${roleConfig.requiredDatabases.join(', ')}`);
    }
    /**
     * Register multiple roles at once
     * @param roleConfigs Array of role configurations
     */
    static registerRoles(roleConfigs) {
        roleConfigs.forEach(config => this.registerRole(config));
    }
    /**
     * Get registered roles from the parent registry
     * @returns Object containing all registered roles
     */
    static getRegisteredRoles() {
        return { ...this.roleRegistry };
    }
    /**
     * Get databases that a specific role can access
     * @param roleName Role name
     * @returns Array of database keys the role can access
     */
    static getRoleDatabases(roleName) {
        const roleConfig = this.roleRegistry[roleName];
        if (!roleConfig) {
            throw new Error(`Role '${roleName}' is not registered.`);
        }
        return [
            ...roleConfig.requiredDatabases,
            ...(roleConfig.optionalDatabases || [])
        ];
    }
    /**
     * Get all databases that current user's roles can access
     * @returns Array of unique database keys
     */
    static getCurrentUserDatabases() {
        const allDatabases = new Set();
        // Always include core database
        allDatabases.add('core');
        // Add databases from all current user roles
        for (const roleName of this.currentUserRoles) {
            const roleConfig = this.roleRegistry[roleName];
            if (roleConfig) {
                roleConfig.requiredDatabases.forEach(db => allDatabases.add(db));
                if (roleConfig.optionalDatabases) {
                    roleConfig.optionalDatabases.forEach(db => allDatabases.add(db));
                }
            }
        }
        return Array.from(allDatabases);
    }
    /**
     * Initialize core database connection (always required)
     * @returns Promise that resolves when core database is connected
     */
    static async initializeCoreConnection() {
        if (this.connections['core']) {
            console.log('[DatabaseManager] Core database already connected.');
            return;
        }
        console.log('[DatabaseManager] Initializing core database connection...');
        try {
            if (!schemas_1.schemaConfigurations['core']) {
                throw new Error('Core database schema not found in schemaConfigurations.');
            }
            const dao = await DatabaseFactory_1.DatabaseFactory.openExisting('core');
            await dao.runSql('PRAGMA integrity_check');
            this.connections['core'] = dao;
            console.log('[DatabaseManager] ✅ Core database connection established.');
        }
        catch (error) {
            console.error('[DatabaseManager] ❌ Failed to initialize core database:', error);
            throw error;
        }
    }
    /**
     * Set current user roles after login
     * @param userRoles Array of role names for the current user
     * @param primaryRole Primary role name (optional)
     */
    static async setCurrentUserRoles(userRoles, primaryRole) {
        // Validate all roles are registered
        for (const roleName of userRoles) {
            if (!this.roleRegistry[roleName]) {
                throw new Error(`Role '${roleName}' is not registered. Please register it first.`);
            }
        }
        const previousRoles = [...this.currentUserRoles];
        this.currentUserRoles = userRoles;
        this.currentRole = primaryRole || userRoles[0] || null;
        console.log(`[DatabaseManager] Setting user roles: ${userRoles.join(', ')} (primary: ${this.currentRole})`);
        // Initialize connections for new user roles
        await this.initializeUserRoleConnections();
        // Close connections that are no longer needed
        await this.cleanupUnusedConnections(previousRoles);
    }
    /**
     * Get current user roles
     * @returns Array of current user role names
     */
    static getCurrentUserRoles() {
        return [...this.currentUserRoles];
    }
    /**
     * Get current primary role
     * @returns Current primary role name or null if none is set
     */
    static getCurrentRole() {
        return this.currentRole;
    }
    /**
     * Initialize database connections for current user's roles
     */
    static async initializeUserRoleConnections() {
        const requiredDatabases = this.getCurrentUserDatabases();
        const startTime = Date.now();
        console.log(`[DatabaseManager] Initializing connections for user roles: ${this.currentUserRoles.join(', ')}`);
        console.log(`[DatabaseManager] Required databases: ${requiredDatabases.join(', ')}`);
        const failedInitializations = [];
        // Initialize required databases in parallel
        const initPromises = requiredDatabases.map(async (dbKey) => {
            // Skip if already connected
            if (this.connections[dbKey]) {
                console.log(`[DB Role Init] Database '${dbKey}' already connected, skipping...`);
                return;
            }
            try {
                console.log(`[DB Role Init] >>>>> Initializing database '${dbKey}'...`);
                if (!schemas_1.schemaConfigurations[dbKey]) {
                    throw new Error(`Database key '${dbKey}' not found in schemaConfigurations.`);
                }
                const dao = await DatabaseFactory_1.DatabaseFactory.openExisting(dbKey);
                await dao.runSql('PRAGMA integrity_check');
                this.connections[dbKey] = dao;
                console.log(`[DB Role Init] <<<<< ✅ Successfully initialized '${dbKey}'.`);
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                console.error(`[DB Role Init] <<<<< ❌ Failed to initialize database '${dbKey}'.`, err);
                // Check if this is a required database for any role
                const isRequired = this.currentUserRoles.some(roleName => {
                    const roleConfig = this.roleRegistry[roleName];
                    return roleConfig && roleConfig.requiredDatabases.includes(dbKey);
                });
                if (isRequired) {
                    failedInitializations.push({ key: dbKey, error: err });
                }
                else {
                    console.warn(`[DB Role Init] ⚠️ Optional database '${dbKey}' failed to initialize, continuing...`);
                }
            }
        });
        await Promise.all(initPromises);
        // Check if any required databases failed
        if (failedInitializations.length > 0) {
            const errorSummary = failedInitializations
                .map(f => `  - ${f.key}: ${f.error.message}`)
                .join('\n');
            throw new Error(`Failed to initialize required databases for user roles:\n${errorSummary}`);
        }
        console.log(`🎉 [DatabaseManager] User role connections initialized successfully in ${Date.now() - startTime}ms`);
    }
    /**
     * Clean up database connections that are no longer needed
     * @param previousRoles Previous user roles
     */
    static async cleanupUnusedConnections(previousRoles) {
        // Get databases that were needed by previous roles
        const previousDatabases = new Set();
        previousDatabases.add('core'); // Always keep core
        for (const roleName of previousRoles) {
            const roleConfig = this.roleRegistry[roleName];
            if (roleConfig) {
                roleConfig.requiredDatabases.forEach(db => previousDatabases.add(db));
                if (roleConfig.optionalDatabases) {
                    roleConfig.optionalDatabases.forEach(db => previousDatabases.add(db));
                }
            }
        }
        // Get databases needed by current roles
        const currentDatabases = new Set(this.getCurrentUserDatabases());
        // Find databases that are no longer needed
        const databasesToClose = Array.from(previousDatabases).filter(db => !currentDatabases.has(db));
        if (databasesToClose.length > 0) {
            console.log(`[DatabaseManager] Closing unused databases: ${databasesToClose.join(', ')}`);
            for (const dbKey of databasesToClose) {
                if (this.connections[dbKey]) {
                    try {
                        await this.connections[dbKey].close();
                        delete this.connections[dbKey];
                        console.log(`[DB Cleanup] ✅ Closed connection for database '${dbKey}'.`);
                    }
                    catch (error) {
                        console.error(`[DB Cleanup] ❌ Failed to close connection for database '${dbKey}'.`, error);
                    }
                }
            }
        }
    }
    /**
     * Check if current user has access to a specific database
     * @param dbKey Database key
     * @returns True if user has access, false otherwise
     */
    static hasAccessToDatabase(dbKey) {
        const allowedDatabases = this.getCurrentUserDatabases();
        return allowedDatabases.includes(dbKey);
    }
    /**
     * Get a database connection with role-based access control
     * @param key Database key
     * @returns SQLiteDAO instance
     */
    static get(key) {
        // Check if user has access to this database
        if (!this.hasAccessToDatabase(key)) {
            throw new Error(`Access denied: Database '${key}' is not accessible by current user roles: ${this.currentUserRoles.join(', ')}`);
        }
        const dao = this.connections[key];
        if (!dao) {
            throw new Error(`Database '${key}' is not connected. Please ensure it's initialized for current user roles.`);
        }
        return dao;
    }
    /**
     * Setup AppState listener with role-aware connection management
     */
    static setupAppStateListener() {
        if (this.appStateListener) {
            this.appStateListener.remove();
        }
        this.appStateListener = react_native_1.AppState.addEventListener('change', async (nextAppState) => {
            console.log(`[DatabaseManager] AppState changed to: ${nextAppState}`);
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                console.log('[DatabaseManager] App is in background/inactive, closing database connections...');
                await this.closeAllConnections();
            }
            else if (nextAppState === 'active') {
                console.log('[DatabaseManager] App is active, reopening database connections...');
                await this.reopenConnections();
            }
        });
        console.log('[DatabaseManager] AppState listener registered with role awareness.');
    }
    /**
     * Close all active database connections
     */
    static async closeAllConnections() {
        console.log('[DatabaseManager] Closing all active database connections...');
        const closePromises = Object.entries(this.connections).map(async ([dbKey, dao]) => {
            try {
                await dao.close();
                console.log(`[DB Close] ✅ Closed connection for database '${dbKey}'.`);
            }
            catch (error) {
                console.error(`[DB Close] ❌ Failed to close connection for database '${dbKey}'.`, error);
            }
        });
        await Promise.all(closePromises);
        this.connections = {};
        console.log('[DatabaseManager] All active connections closed.');
    }
    /**
     * Reopen connections based on current user roles
     */
    static async reopenConnections() {
        console.log('[DatabaseManager] Reopening connections for current user roles...');
        // Ensure core connection is established
        await this.initializeCoreConnection();
        // Initialize connections for current user roles
        if (this.currentUserRoles.length > 0) {
            await this.initializeUserRoleConnections();
        }
    }
    // Keep existing methods for backward compatibility
    static getConnections() {
        return { ...this.connections };
    }
    static async debugDatabaseFiles(databaseKeys) {
        console.log('=== DATABASE FILES DEBUG ===');
        for (const key of databaseKeys) {
            if (!schemas_1.schemaConfigurations[key]) {
                console.log(`❌ Key '${key}' not found in schemaConfigurations`);
                continue;
            }
            const schema = schemas_1.schemaConfigurations[key];
            const actualDbName = schema.database_name;
            const outputDir = react_native_fs_1.default.DocumentDirectoryPath;
            const dbFileName = actualDbName.endsWith('.db') ? actualDbName : `${actualDbName}.db`;
            const dbPath = `${outputDir}/../databases/${dbFileName}`;
            console.log(`🔍 Checking database '${key}':`);
            console.log(`  - Schema database_name: ${actualDbName}`);
            console.log(`  - Final filename: ${dbFileName}`);
            console.log(`  - Full path: ${dbPath}`);
            try {
                const exists = await react_native_fs_1.default.exists(dbPath);
                console.log(`  - File exists: ${exists}`);
                if (exists) {
                    const stat = await react_native_fs_1.default.stat(dbPath);
                    console.log(`  - File size: ${stat.size} bytes`);
                    console.log(`  - Modified: ${new Date(stat.mtime).toLocaleString()}`);
                }
            }
            catch (error) {
                console.error(`  - Error checking file: ${error}`);
            }
        }
        console.log('=== END DEBUG ===');
    }
    static async openAllExisting(databaseKeys) {
        const startTime = Date.now();
        console.log('=== BEFORE OPENING EXISTING DATABASES ===');
        await this.debugDatabaseFiles(databaseKeys);
        console.log('DatabaseManager: Starting to open existing databases...');
        const failedOpens = [];
        for (const key of databaseKeys) {
            console.log(`[DB Open] >>>>> Attempting to open database '${key}'...`);
            try {
                if (!schemas_1.schemaConfigurations[key]) {
                    throw new Error(`Invalid database key: ${key}. Not found in schemaConfigurations.`);
                }
                const dao = await DatabaseFactory_1.DatabaseFactory.openExisting(key);
                await dao.runSql('PRAGMA integrity_check');
                this.connections[key] = dao;
                console.log(`[DB Open] <<<<< ✅ Successfully opened '${key}'.`);
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                console.error(`[DB Open] <<<<< ❌ Failed to open database '${key}'.`, err);
                failedOpens.push({ key, error: err });
            }
        }
        if (failedOpens.length > 0) {
            const errorSummary = failedOpens
                .map(f => `  - ${f.key}: ${f.error.message}`)
                .join('\n');
            throw new Error(`DatabaseManager: Failed to open one or more databases:\n${errorSummary}`);
        }
        console.log(`🎉 DatabaseManager: All existing databases opened successfully took ${Date.now() - startTime}ms`);
        this.isInitialized = true;
        this.setupAppStateListener();
        return true;
    }
    static async initializeAll() {
        if (this.isInitialized) {
            console.log('DatabaseManager: All databases are already initialized.');
            return;
        }
        console.log('DatabaseManager: Starting initialization of all databases...');
        const failedInitializations = [];
        const initPromises = Object.entries(schemas_1.schemaConfigurations).map(async ([key, schema]) => {
            console.log(`[DB Init] >>>>> Initializing database '${key}'...`);
            try {
                const dao = await DatabaseFactory_1.DatabaseFactory.createFromConfig(schema, {
                    debug: __DEV__,
                });
                this.connections[key] = dao;
                console.log(`[DB Init] <<<<< ✅ Initialized '${key}'.`);
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                console.error(`[DB Init] <<<<< ❌ Failed to initialize '${key}'.`, err);
                failedInitializations.push({ key, error: err });
            }
        });
        await Promise.all(initPromises);
        if (failedInitializations.length > 0) {
            this.isInitialized = false;
            const errorSummary = failedInitializations
                .map(f => `  - ${f.key}: ${f.error.message}`)
                .join('\n');
            throw new Error(`DatabaseManager: Một hoặc nhiều database đã thất bại khi khởi tạo:\n${errorSummary}`);
        }
        this.isInitialized = true;
        console.log('🎉 DatabaseManager: Tất cả các cơ sở dữ liệu đã được khởi tạo thành công.');
        this.setupAppStateListener();
    }
    static async getLazyLoading(key) {
        // Check access permission first
        if (!this.hasAccessToDatabase(key)) {
            throw new Error(`Access denied: Database '${key}' is not accessible by current user roles: ${this.currentUserRoles.join(', ')}`);
        }
        if (!this.connections[key]) {
            if (!schemas_1.schemaConfigurations[key]) {
                throw new Error(`Invalid database key: ${key}. Not found in schemaConfigurations.`);
            }
            if (Object.keys(this.connections).length >= this.maxConnections) {
                throw new Error('Maximum number of database connections reached');
            }
            console.log(`[DB Lazy Init] >>>>> Initializing database '${key}'...`);
            const dao = await DatabaseFactory_1.DatabaseFactory.openExisting(key);
            await dao.runSql('PRAGMA integrity_check');
            this.connections[key] = dao;
            console.log(`[DB Lazy Init] <<<<< ✅ Initialized '${key}'.`);
        }
        this.setupAppStateListener();
        this.isInitialized = true;
        return this.connections[key];
    }
    static async executeCrossSchemaTransaction(schemas, callback) {
        // Check access permissions for all schemas
        for (const key of schemas) {
            if (!this.hasAccessToDatabase(key)) {
                throw new Error(`Access denied: Database '${key}' is not accessible by current user roles: ${this.currentUserRoles.join(', ')}`);
            }
        }
        const daos = schemas.reduce((acc, key) => {
            acc[key] = this.get(key);
            return acc;
        }, {});
        try {
            await Promise.all(Object.values(daos).map(dao => dao.beginTransaction()));
            await callback(daos);
            await Promise.all(Object.values(daos).map(dao => dao.commitTransaction()));
        }
        catch (error) {
            await Promise.all(Object.values(daos).map(dao => dao.rollbackTransaction()));
            throw error;
        }
    }
    static async closeAll() {
        console.log('DatabaseManager: Closing all database connections...');
        // Close all active connections
        await this.closeAllConnections();
        // Reset state
        this.currentUserRoles = [];
        this.currentRole = null;
        this.isInitialized = false;
        // Remove app state listener
        if (this.appStateListener) {
            this.appStateListener.remove();
            this.appStateListener = null;
        }
        console.log('DatabaseManager: All connections closed and state reset.');
    }
    /**
     * Logout user and close role-specific connections
     */
    static async logout() {
        console.log('[DatabaseManager] User logout, closing role-specific connections...');
        // Close all connections except core
        const connectionsToClose = Object.keys(this.connections).filter(key => key !== 'core');
        for (const dbKey of connectionsToClose) {
            try {
                await this.connections[dbKey].close();
                delete this.connections[dbKey];
                console.log(`[DB Logout] ✅ Closed connection for database '${dbKey}'.`);
            }
            catch (error) {
                console.error(`[DB Logout] ❌ Failed to close connection for database '${dbKey}'.`, error);
            }
        }
        // Reset user roles
        this.currentUserRoles = [];
        this.currentRole = null;
        console.log('[DatabaseManager] User logout completed, only core connection remains.');
    }
}
exports.DatabaseManager = DatabaseManager;
DatabaseManager.appStateListener = null;
DatabaseManager.maxConnections = 5;
// Active database connections - this is the actual working set
DatabaseManager.connections = {};
DatabaseManager.isInitialized = false;
// Role configuration registry - this is the parent set that defines what databases each role can access
DatabaseManager.roleRegistry = {};
DatabaseManager.currentRole = null;
DatabaseManager.currentUserRoles = []; // User can have multiple roles
exports.default = DatabaseManager;
