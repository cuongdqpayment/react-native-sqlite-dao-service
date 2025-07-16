import {AppState, AppStateStatus} from 'react-native';
import RNFS from 'react-native-fs';
import {DatabaseFactory} from './DatabaseFactory';
import SQLiteDAO from './SQLiteDAO';
import {schemaConfigurations} from './schemas'; // Import the central schema registry

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
  priority?: number; // Higher priority roles get initialized first
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
export class DatabaseManager {
  private static appStateListener: any = null;
  private static maxConnections = 5;
  
  // Active database connections - this is the actual working set
  private static connections: DatabaseConnections = {};
  private static isInitialized = false;
  
  // Role configuration registry - this is the parent set that defines what databases each role can access
  private static roleRegistry: RoleRegistry = {};
  private static currentRole: string | null = null;
  private static currentUserRoles: string[] = []; // User can have multiple roles

  /**
   * Register a role configuration in the parent registry
   * @param roleConfig Role configuration object
   */
  public static registerRole(roleConfig: RoleConfig): void {
    this.roleRegistry[roleConfig.roleName] = roleConfig;
    console.log(`[DatabaseManager] Role '${roleConfig.roleName}' registered with databases: ${roleConfig.requiredDatabases.join(', ')}`);
  }

  /**
   * Register multiple roles at once
   * @param roleConfigs Array of role configurations
   */
  public static registerRoles(roleConfigs: RoleConfig[]): void {
    roleConfigs.forEach(config => this.registerRole(config));
  }

  /**
   * Get registered roles from the parent registry
   * @returns Object containing all registered roles
   */
  public static getRegisteredRoles(): RoleRegistry {
    return { ...this.roleRegistry };
  }

  /**
   * Get databases that a specific role can access
   * @param roleName Role name
   * @returns Array of database keys the role can access
   */
  public static getRoleDatabases(roleName: string): string[] {
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
  public static getCurrentUserDatabases(): string[] {
    const allDatabases = new Set<string>();
    
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
  public static async initializeCoreConnection(): Promise<void> {
    if (this.connections['core']) {
      console.log('[DatabaseManager] Core database already connected.');
      return;
    }

    console.log('[DatabaseManager] Initializing core database connection...');
    
    try {
      if (!schemaConfigurations['core']) {
        throw new Error('Core database schema not found in schemaConfigurations.');
      }

      const dao = await DatabaseFactory.openExisting('core');
      await dao.runSql('PRAGMA integrity_check');
      this.connections['core'] = dao;
      
      console.log('[DatabaseManager] ✅ Core database connection established.');
    } catch (error) {
      console.error('[DatabaseManager] ❌ Failed to initialize core database:', error);
      throw error;
    }
  }

  /**
   * Set current user roles after login
   * @param userRoles Array of role names for the current user
   * @param primaryRole Primary role name (optional)
   */
  public static async setCurrentUserRoles(userRoles: string[], primaryRole?: string): Promise<void> {
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
  public static getCurrentUserRoles(): string[] {
    return [...this.currentUserRoles];
  }

  /**
   * Get current primary role
   * @returns Current primary role name or null if none is set
   */
  public static getCurrentRole(): string | null {
    return this.currentRole;
  }

  /**
   * Initialize database connections for current user's roles
   */
  private static async initializeUserRoleConnections(): Promise<void> {
    const requiredDatabases = this.getCurrentUserDatabases();
    const startTime = Date.now();
    
    console.log(`[DatabaseManager] Initializing connections for user roles: ${this.currentUserRoles.join(', ')}`);
    console.log(`[DatabaseManager] Required databases: ${requiredDatabases.join(', ')}`);

    const failedInitializations: { key: string; error: Error }[] = [];

    // Initialize required databases in parallel
    const initPromises = requiredDatabases.map(async (dbKey) => {
      // Skip if already connected
      if (this.connections[dbKey]) {
        console.log(`[DB Role Init] Database '${dbKey}' already connected, skipping...`);
        return;
      }

      try {
        console.log(`[DB Role Init] >>>>> Initializing database '${dbKey}'...`);
        
        if (!schemaConfigurations[dbKey]) {
          throw new Error(`Database key '${dbKey}' not found in schemaConfigurations.`);
        }

        const dao = await DatabaseFactory.openExisting(dbKey);
        await dao.runSql('PRAGMA integrity_check');
        this.connections[dbKey] = dao;
        
        console.log(`[DB Role Init] <<<<< ✅ Successfully initialized '${dbKey}'.`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[DB Role Init] <<<<< ❌ Failed to initialize database '${dbKey}'.`, err);
        
        // Check if this is a required database for any role
        const isRequired = this.currentUserRoles.some(roleName => {
          const roleConfig = this.roleRegistry[roleName];
          return roleConfig && roleConfig.requiredDatabases.includes(dbKey);
        });
        
        if (isRequired) {
          failedInitializations.push({ key: dbKey, error: err });
        } else {
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
  private static async cleanupUnusedConnections(previousRoles: string[]): Promise<void> {
    // Get databases that were needed by previous roles
    const previousDatabases = new Set<string>();
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
          } catch (error) {
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
  public static hasAccessToDatabase(dbKey: string): boolean {
    const allowedDatabases = this.getCurrentUserDatabases();
    return allowedDatabases.includes(dbKey);
  }

  /**
   * Get a database connection with role-based access control
   * @param key Database key
   * @returns SQLiteDAO instance
   */
  public static get(key: keyof typeof schemaConfigurations): SQLiteDAO {
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
  private static setupAppStateListener(): void {
    if (this.appStateListener) {
      this.appStateListener.remove();
    }

    this.appStateListener = AppState.addEventListener(
      'change',
      async (nextAppState: AppStateStatus) => {
        console.log(`[DatabaseManager] AppState changed to: ${nextAppState}`);

        if (nextAppState === 'background' || nextAppState === 'inactive') {
          console.log('[DatabaseManager] App is in background/inactive, closing database connections...');
          await this.closeAllConnections();
        } else if (nextAppState === 'active') {
          console.log('[DatabaseManager] App is active, reopening database connections...');
          await this.reopenConnections();
        }
      },
    );

    console.log('[DatabaseManager] AppState listener registered with role awareness.');
  }

  /**
   * Close all active database connections
   */
  private static async closeAllConnections(): Promise<void> {
    console.log('[DatabaseManager] Closing all active database connections...');
    
    const closePromises = Object.entries(this.connections).map(async ([dbKey, dao]) => {
      try {
        await dao.close();
        console.log(`[DB Close] ✅ Closed connection for database '${dbKey}'.`);
      } catch (error) {
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
  public static async reopenConnections(): Promise<void> {
    console.log('[DatabaseManager] Reopening connections for current user roles...');
    
    // Ensure core connection is established
    await this.initializeCoreConnection();
    
    // Initialize connections for current user roles
    if (this.currentUserRoles.length > 0) {
      await this.initializeUserRoleConnections();
    }
  }

  // Keep existing methods for backward compatibility
  public static getConnections(): DatabaseConnections {
    return { ...this.connections };
  }

  public static async debugDatabaseFiles(databaseKeys: string[]): Promise<void> {
    console.log('=== DATABASE FILES DEBUG ===');

    for (const key of databaseKeys) {
      if (!schemaConfigurations[key]) {
        console.log(`❌ Key '${key}' not found in schemaConfigurations`);
        continue;
      }

      const schema = schemaConfigurations[key];
      const actualDbName = schema.database_name;

      const outputDir = RNFS.DocumentDirectoryPath;
      const dbFileName = actualDbName.endsWith('.db') ? actualDbName : `${actualDbName}.db`;
      const dbPath = `${outputDir}/../databases/${dbFileName}`;

      console.log(`🔍 Checking database '${key}':`);
      console.log(`  - Schema database_name: ${actualDbName}`);
      console.log(`  - Final filename: ${dbFileName}`);
      console.log(`  - Full path: ${dbPath}`);

      try {
        const exists = await RNFS.exists(dbPath);
        console.log(`  - File exists: ${exists}`);

        if (exists) {
          const stat = await RNFS.stat(dbPath);
          console.log(`  - File size: ${stat.size} bytes`);
          console.log(`  - Modified: ${new Date(stat.mtime).toLocaleString()}`);
        }
      } catch (error) {
        console.error(`  - Error checking file: ${error}`);
      }
    }
    console.log('=== END DEBUG ===');
  }

  public static async openAllExisting(databaseKeys: string[]): Promise<boolean> {
    const startTime = Date.now();

    console.log('=== BEFORE OPENING EXISTING DATABASES ===');
    await this.debugDatabaseFiles(databaseKeys);

    console.log('DatabaseManager: Starting to open existing databases...');
    const failedOpens: {key: string; error: Error}[] = [];

    for (const key of databaseKeys) {
      console.log(`[DB Open] >>>>> Attempting to open database '${key}'...`);
      try {
        if (!schemaConfigurations[key]) {
          throw new Error(`Invalid database key: ${key}. Not found in schemaConfigurations.`);
        }

        const dao = await DatabaseFactory.openExisting(key);
        await dao.runSql('PRAGMA integrity_check');
        this.connections[key] = dao;
        console.log(`[DB Open] <<<<< ✅ Successfully opened '${key}'.`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[DB Open] <<<<< ❌ Failed to open database '${key}'.`, err);
        failedOpens.push({key, error: err});
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

  public static async initializeAll(): Promise<void> {
    if (this.isInitialized) {
      console.log('DatabaseManager: All databases are already initialized.');
      return;
    }

    console.log('DatabaseManager: Starting initialization of all databases...');
    const failedInitializations: {key: string; error: Error}[] = [];

    const initPromises = Object.entries(schemaConfigurations).map(
      async ([key, schema]) => {
        console.log(`[DB Init] >>>>> Initializing database '${key}'...`);
        try {
          const dao = await DatabaseFactory.createFromConfig(schema, {
            debug: __DEV__,
          });
          this.connections[key] = dao;
          console.log(`[DB Init] <<<<< ✅ Initialized '${key}'.`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(`[DB Init] <<<<< ❌ Failed to initialize '${key}'.`, err);
          failedInitializations.push({key, error: err});
        }
      },
    );
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

  public static async getLazyLoading(key: keyof typeof schemaConfigurations): Promise<SQLiteDAO> {
    // Check access permission first
    if (!this.hasAccessToDatabase(key)) {
      throw new Error(`Access denied: Database '${key}' is not accessible by current user roles: ${this.currentUserRoles.join(', ')}`);
    }

    if (!this.connections[key]) {
      if (!schemaConfigurations[key]) {
        throw new Error(`Invalid database key: ${key}. Not found in schemaConfigurations.`);
      }
      
      if (Object.keys(this.connections).length >= this.maxConnections) {
        throw new Error('Maximum number of database connections reached');
      }

      console.log(`[DB Lazy Init] >>>>> Initializing database '${key}'...`);
      const dao = await DatabaseFactory.openExisting(key);
      await dao.runSql('PRAGMA integrity_check');
      this.connections[key] = dao;
      console.log(`[DB Lazy Init] <<<<< ✅ Initialized '${key}'.`);
    }

    this.setupAppStateListener();
    this.isInitialized = true;

    return this.connections[key];
  }

  public static async executeCrossSchemaTransaction(
    schemas: string[],
    callback: (daos: Record<string, SQLiteDAO>) => Promise<void>,
  ): Promise<void> {
    // Check access permissions for all schemas
    for (const key of schemas) {
      if (!this.hasAccessToDatabase(key)) {
        throw new Error(`Access denied: Database '${key}' is not accessible by current user roles: ${this.currentUserRoles.join(', ')}`);
      }
    }

    const daos = schemas.reduce((acc, key) => {
      acc[key] = this.get(key);
      return acc;
    }, {} as Record<string, SQLiteDAO>);

    try {
      await Promise.all(Object.values(daos).map(dao => dao.beginTransaction()));
      await callback(daos);
      await Promise.all(Object.values(daos).map(dao => dao.commitTransaction()));
    } catch (error) {
      await Promise.all(Object.values(daos).map(dao => dao.rollbackTransaction()));
      throw error;
    }
  }

  public static async closeAll(): Promise<void> {
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
  public static async logout(): Promise<void> {
    console.log('[DatabaseManager] User logout, closing role-specific connections...');
    
    // Close all connections except core
    const connectionsToClose = Object.keys(this.connections).filter(key => key !== 'core');
    
    for (const dbKey of connectionsToClose) {
      try {
        await this.connections[dbKey].close();
        delete this.connections[dbKey];
        console.log(`[DB Logout] ✅ Closed connection for database '${dbKey}'.`);
      } catch (error) {
        console.error(`[DB Logout] ❌ Failed to close connection for database '${dbKey}'.`, error);
      }
    }
    
    // Reset user roles
    this.currentUserRoles = [];
    this.currentRole = null;
    
    console.log('[DatabaseManager] User logout completed, only core connection remains.');
  }
}

export default DatabaseManager;