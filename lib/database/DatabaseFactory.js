"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseFactory = void 0;
const react_native_1 = require("react-native");
const react_native_fs_1 = __importDefault(require("react-native-fs"));
const SQLiteDAO_1 = __importDefault(require("./SQLiteDAO"));
/**
 * A factory class to create and initialize a SQLiteDAO instance from a JSON schema.
 * It encapsulates the logic of reading configuration, validating it, and setting up the database.
 */
class DatabaseFactory {
    // Thêm vào DatabaseFactory class
    /**
     * Debug method to list all files in database directory
     */
    static async debugDatabaseDirectory(customDirectory) {
        const outputDir = this.getDbDirectory(customDirectory);
        console.log(`🗂️ Database directory: ${outputDir}`);
        try {
            const dirExists = await react_native_fs_1.default.exists(outputDir);
            console.log(`Directory exists: ${dirExists}`);
            if (dirExists) {
                const files = await react_native_fs_1.default.readDir(outputDir);
                console.log(`Files in directory (${files.length}):`);
                files.forEach((file, index) => {
                    console.log(`  ${index + 1}. ${file.name} (${file.size} bytes)`);
                });
            }
        }
        catch (error) {
            console.error(`Error reading directory: ${error}`);
        }
    }
    /**
     * Thêm kiểm tra phiên bản schema trong DatabaseFactory để đảm bảo schema trong mã khớp với cơ sở dữ liệu hiện tại:
     * Lợi ích: Ngăn chặn lỗi do schema không đồng bộ.
     * @param dao
     * @param schema
     */
    static async validateSchemaVersion(dao, schema) {
        const dbInfo = await dao.getDatabaseInfo();
        if (dbInfo.version !== schema.version) {
            throw new Error(`Schema version mismatch: database (${dbInfo.version}) vs config (${schema.version})`);
        }
    }
    /**
     * Opens an existing database without initializing its schema.
     * Thêm kiểm tra tính toàn vẹn file cơ sở dữ liệu trong DatabaseFactory.openExisting() để phát hiện file bị hỏng:
     * Lợi ích: Phát hiện sớm các file cơ sở dữ liệu bị hỏng, tránh lỗi runtime.
     * @param dbName The name of the database (e.g., 'core.db' or 'core').
     * @param options Additional options for database connection.
     * @returns A promise that resolves to a connected SQLiteDAO instance.
     */
    static async openExisting(dbName, options = {}) {
        // Step 1: Determine the database file path
        const outputDir = this.getDbDirectory(options.dbDirectory);
        const dirExists = await react_native_fs_1.default.exists(outputDir);
        if (!dirExists) {
            await react_native_fs_1.default.mkdir(outputDir);
        }
        const dbFileName = dbName.endsWith('.db') ? dbName : `${dbName}.db`;
        const dbPath = `${outputDir}/../databases/${dbFileName}`;
        // Step 2: Check if the database file exists
        const fileExists = await react_native_fs_1.default.exists(dbPath);
        if (!fileExists) {
            throw new Error(`Database file does not exist at: ${dbPath}`);
        }
        console.log(`🗄️ Opening existing database at: ${dbPath}`);
        // Step 3: Create and connect DAO instance
        const dao = new SQLiteDAO_1.default(dbFileName, options.debug ?? __DEV__);
        try {
            await dao.connect();
            // Kiểm tra tính toàn vẹn
            //
            await dao.runSql('PRAGMA integrity_check');
            console.log(`🔗 Connection to existing database '${dbFileName}' established.`);
            return dao;
        }
        catch (error) {
            console.error(`❌ Failed to open existing database '${dbFileName}'.`);
            await dao.close();
            throw error;
        }
    }
    /**
     * Validates the provided schema object to ensure it has the minimum required properties.
     * @param schema The schema object to validate.
     * @returns True if the schema is valid, otherwise throws an error.
     */
    static validateSchema(schema) {
        if (!schema) {
            throw new Error('Schema configuration is null or undefined.');
        }
        if (typeof schema.database_name !== 'string' ||
            schema.database_name.trim() === '') {
            throw new Error("Invalid or missing 'database_name' in schema. This is required to name the database file.");
        }
        if (typeof schema.schemas !== 'object' ||
            schema.schemas === null ||
            Object.keys(schema.schemas).length === 0) {
            throw new Error("Invalid or missing 'schemas' object in schema. At least one table definition is required.");
        }
        // You can add more specific validation rules here if needed
        return true;
    }
    /**
     * Gets the appropriate database directory based on the platform.
     * @param customDirectory Optional custom directory path
     * @returns The resolved database directory path
     */
    static getDbDirectory(customDirectory) {
        if (customDirectory) {
            return customDirectory;
        }
        // Use platform-specific default directories
        if (react_native_1.Platform.OS === 'ios') {
            return react_native_fs_1.default.DocumentDirectoryPath;
        }
        else if (react_native_1.Platform.OS === 'android') {
            return react_native_fs_1.default.DocumentDirectoryPath;
        }
        else {
            // Fallback for other platforms
            return react_native_fs_1.default.DocumentDirectoryPath;
        }
    }
    /**
     * Loads JSON schema from a file in the app bundle.
     * @param configPath Relative path to the JSON file in the bundle
     * @returns Promise that resolves to the parsed JSON schema
     */
    static async loadSchemaFromBundle(configPath) {
        try {
            // For React Native, files in the bundle are accessed differently
            // This assumes the JSON file is in the bundle and can be read via RNFS
            const bundlePath = react_native_1.Platform.OS === 'ios'
                ? `${react_native_fs_1.default.MainBundlePath}/${configPath}`
                : `${react_native_fs_1.default.MainBundlePath}/${configPath}`;
            const schemaContent = await react_native_fs_1.default.readFile(bundlePath, 'utf8');
            const schema = JSON.parse(schemaContent);
            console.log(`✅ Schema loaded successfully from bundle: ${configPath}`);
            return schema;
        }
        catch (err) {
            console.error(`❌ Failed to read or parse schema file from bundle: ${configPath}`);
            throw err;
        }
    }
    /**
     * Loads JSON schema from the documents directory.
     * @param configPath Path to the JSON file in documents directory
     * @returns Promise that resolves to the parsed JSON schema
     */
    static async loadSchemaFromDocuments(configPath) {
        try {
            const fullPath = `${react_native_fs_1.default.DocumentDirectoryPath}/${configPath}`;
            const schemaContent = await react_native_fs_1.default.readFile(fullPath, 'utf8');
            const schema = JSON.parse(schemaContent);
            console.log(`✅ Schema loaded successfully from documents: ${configPath}`);
            return schema;
        }
        catch (err) {
            console.error(`❌ Failed to read or parse schema file from documents: ${configPath}`);
            throw err;
        }
    }
    /**
     * Creates, connects, and initializes a database from a configuration file or object.
     * This is the main method to get a ready-to-use DAO instance.
     * @param options Configuration options specifying either a direct config object or a file path.
     * @returns A promise that resolves to a fully initialized and connected SQLiteDAO instance.
     */
    static async create(options) {
        let schema;
        // Step 1: Load and validate the schema configuration
        if (options.config) {
            schema = options.config;
            console.log('✅ Schema loaded successfully from the provided object.');
        }
        else if (options.configAsset) {
            // Option 3: Use a required JSON asset (e.g., require('./config.json'))
            schema = options.configAsset;
            console.log('✅ Schema loaded successfully from the provided asset.');
        }
        else if (options.configPath) {
            // Option 2: Load from file path
            // Try to load from bundle first, then from documents directory
            try {
                schema = await this.loadSchemaFromBundle(options.configPath);
            }
            catch (bundleError) {
                console.log('Failed to load from bundle, trying documents directory...');
                try {
                    schema = await this.loadSchemaFromDocuments(options.configPath);
                }
                catch (documentsError) {
                    console.error('Failed to load from both bundle and documents directory');
                    throw documentsError;
                }
            }
        }
        else {
            throw new Error("Either 'config' (a schema object), 'configAsset' (a required JSON), or 'configPath' (a file path) must be provided to the factory.");
        }
        this.validateSchema(schema);
        // Step 2: Determine the final database file path
        const outputDir = this.getDbDirectory(options.dbDirectory);
        // Ensure the target directory exists
        const dirExists = await react_native_fs_1.default.exists(outputDir);
        if (!dirExists) {
            await react_native_fs_1.default.mkdir(outputDir);
        }
        // Create the full database path
        const dbFileName = schema.database_name.endsWith('.db')
            ? schema.database_name
            : `${schema.database_name}.db`;
        const dbPath = `${outputDir}/${dbFileName}`;
        console.log(`🗄️ Database will be created/connected at: ${dbPath}`);
        // Step 3: Initialize DAO, connect, and build the schema
        const dao = new SQLiteDAO_1.default(dbFileName, options.debug ?? true);
        try {
            // Establish the connection to the database file
            await dao.connect();
            console.log('🔗 Connection to the database has been established.');
            // Initialize the database schema (creates tables, indexes, etc.)
            await dao.initializeFromSchema(schema);
            console.log('🎉 Database schema has been successfully initialized.');
            // Step 4: Return the fully configured and ready-to-use DAO instance
            return dao;
        }
        catch (error) {
            console.error('❌ A critical error occurred during database initialization.');
            // Attempt to close the connection if it was opened before the error
            if (dao.isConnected()) {
                await dao.close();
            }
            throw error; // Rethrow to allow for higher-level error handling
        }
    }
    /**
     * Convenience method to create a database from a JSON asset that was imported/required.
     * @param configAsset The imported/required JSON configuration
     * @param options Additional options for database creation
     * @returns A promise that resolves to a fully initialized and connected SQLiteDAO instance.
     */
    static async createFromAsset(configAsset, options = {}) {
        return this.create({
            ...options,
            configAsset,
        });
    }
    /**
     * Convenience method to create a database from a configuration object.
     * @param config The database schema configuration object
     * @param options Additional options for database creation
     * @returns A promise that resolves to a fully initialized and connected SQLiteDAO instance.
     */
    static async createFromConfig(config, options = {}) {
        return this.create({
            ...options,
            config,
        });
    }
    /**
     * Convenience method to create a database from a JSON file path.
     * @param configPath Path to the JSON configuration file
     * @param options Additional options for database creation
     * @returns A promise that resolves to a fully initialized and connected SQLiteDAO instance.
     */
    static async createFromPath(configPath, options = {}) {
        return this.create({
            ...options,
            configPath,
        });
    }
}
exports.DatabaseFactory = DatabaseFactory;
exports.default = DatabaseFactory;
