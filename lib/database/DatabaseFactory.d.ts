import SQLiteDAO, { DatabaseSchemaWithTypeMapping } from './SQLiteDAO';
interface DbFactoryOptions {
    config?: DatabaseSchemaWithTypeMapping;
    configPath?: string;
    configAsset?: any;
    dbDirectory?: string;
    debug?: boolean;
}
/**
 * A factory class to create and initialize a SQLiteDAO instance from a JSON schema.
 * It encapsulates the logic of reading configuration, validating it, and setting up the database.
 */
export declare class DatabaseFactory {
    /**
     * Debug method to list all files in database directory
     */
    static debugDatabaseDirectory(customDirectory?: string): Promise<void>;
    /**
     * Thêm kiểm tra phiên bản schema trong DatabaseFactory để đảm bảo schema trong mã khớp với cơ sở dữ liệu hiện tại:
     * Lợi ích: Ngăn chặn lỗi do schema không đồng bộ.
     * @param dao
     * @param schema
     */
    private static validateSchemaVersion;
    /**
     * Opens an existing database without initializing its schema.
     * Thêm kiểm tra tính toàn vẹn file cơ sở dữ liệu trong DatabaseFactory.openExisting() để phát hiện file bị hỏng:
     * Lợi ích: Phát hiện sớm các file cơ sở dữ liệu bị hỏng, tránh lỗi runtime.
     * @param dbName The name of the database (e.g., 'core.db' or 'core').
     * @param options Additional options for database connection.
     * @returns A promise that resolves to a connected SQLiteDAO instance.
     */
    static openExisting(dbName: string, options?: Omit<DbFactoryOptions, 'config' | 'configAsset' | 'configPath'>): Promise<SQLiteDAO>;
    /**
     * Validates the provided schema object to ensure it has the minimum required properties.
     * @param schema The schema object to validate.
     * @returns True if the schema is valid, otherwise throws an error.
     */
    private static validateSchema;
    /**
     * Gets the appropriate database directory based on the platform.
     * @param customDirectory Optional custom directory path
     * @returns The resolved database directory path
     */
    private static getDbDirectory;
    /**
     * Loads JSON schema from a file in the app bundle.
     * @param configPath Relative path to the JSON file in the bundle
     * @returns Promise that resolves to the parsed JSON schema
     */
    private static loadSchemaFromBundle;
    /**
     * Loads JSON schema from the documents directory.
     * @param configPath Path to the JSON file in documents directory
     * @returns Promise that resolves to the parsed JSON schema
     */
    private static loadSchemaFromDocuments;
    /**
     * Creates, connects, and initializes a database from a configuration file or object.
     * This is the main method to get a ready-to-use DAO instance.
     * @param options Configuration options specifying either a direct config object or a file path.
     * @returns A promise that resolves to a fully initialized and connected SQLiteDAO instance.
     */
    static create(options: DbFactoryOptions): Promise<SQLiteDAO>;
    /**
     * Convenience method to create a database from a JSON asset that was imported/required.
     * @param configAsset The imported/required JSON configuration
     * @param options Additional options for database creation
     * @returns A promise that resolves to a fully initialized and connected SQLiteDAO instance.
     */
    static createFromAsset(configAsset: DatabaseSchemaWithTypeMapping, options?: Omit<DbFactoryOptions, 'config' | 'configAsset' | 'configPath'>): Promise<SQLiteDAO>;
    /**
     * Convenience method to create a database from a configuration object.
     * @param config The database schema configuration object
     * @param options Additional options for database creation
     * @returns A promise that resolves to a fully initialized and connected SQLiteDAO instance.
     */
    static createFromConfig(config: DatabaseSchemaWithTypeMapping, options?: Omit<DbFactoryOptions, 'config' | 'configAsset' | 'configPath'>): Promise<SQLiteDAO>;
    /**
     * Convenience method to create a database from a JSON file path.
     * @param configPath Path to the JSON configuration file
     * @param options Additional options for database creation
     * @returns A promise that resolves to a fully initialized and connected SQLiteDAO instance.
     */
    static createFromPath(configPath: string, options?: Omit<DbFactoryOptions, 'config' | 'configAsset' | 'configPath'>): Promise<SQLiteDAO>;
}
export default DatabaseFactory;
