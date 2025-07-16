"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteDAO = void 0;
const react_native_sqlite_storage_1 = __importDefault(require("react-native-sqlite-storage"));
react_native_sqlite_storage_1.default.enablePromise(true);
class SQLiteDAO {
    constructor(dbFilePath, debug = true) {
        this.db = null;
        this.isOpen = false;
        this.isDebug = true;
        this.inTransaction = false;
        this.typeMappingConfig = null;
        this.dbName = dbFilePath;
        this.isDebug = debug;
        // Connection is no longer initiated in the constructor
    }
    /**
     * Establishes a connection to the database. Must be called after instantiation.
     */
    async connect() {
        if (this.isOpen) {
            this.log('Database is already connected.');
            return;
        }
        try {
            this.db = await react_native_sqlite_storage_1.default.openDatabase({
                name: this.dbName,
                location: 'default',
            });
            this.isOpen = true;
            this.log(`Connected to database ${this.dbName} at ${new Date().toLocaleString()}`);
        }
        catch (err) {
            console.error(`Could NOT connect to database ${this.dbName}:`, err);
            this.isOpen = false;
            throw err;
        }
    }
    log(message, ...args) {
        if (this.isDebug) {
            console.log(`[SQLiteDAO]: ${message}`, ...args);
        }
    }
    logError(message, ...args) {
        console.error(`[SQLiteDAO ERROR]: ${message}`, ...args);
    }
    // ===========================================
    // TYPE MAPPING UTILITIES
    // ===========================================
    setTypeMappingConfig(config) {
        this.typeMappingConfig = config;
        this.log('Type mapping configuration loaded');
    }
    convertToSQLiteType(genericType) {
        if (!this.typeMappingConfig || !this.typeMappingConfig.sqlite) {
            return this.getDefaultSQLiteType(genericType);
        }
        const sqliteMapping = this.typeMappingConfig.sqlite;
        const sqliteType = sqliteMapping[genericType.toLowerCase()];
        if (!sqliteType) {
            this.log(`Warning: Unknown type '${genericType}', using TEXT as default`);
            return 'TEXT';
        }
        return sqliteType;
    }
    getDefaultSQLiteType(genericType) {
        const defaultMapping = {
            string: 'TEXT',
            varchar: 'TEXT',
            char: 'TEXT',
            email: 'TEXT',
            url: 'TEXT',
            uuid: 'TEXT',
            integer: 'INTEGER',
            bigint: 'INTEGER',
            smallint: 'INTEGER',
            tinyint: 'INTEGER',
            decimal: 'REAL',
            numeric: 'REAL',
            float: 'REAL',
            double: 'REAL',
            boolean: 'INTEGER',
            timestamp: 'TEXT',
            datetime: 'TEXT',
            date: 'TEXT',
            time: 'TEXT',
            json: 'TEXT',
            array: 'TEXT',
            blob: 'BLOB',
            binary: 'BLOB',
        };
        return defaultMapping[genericType.toLowerCase()] || 'TEXT';
    }
    processColumnDefinition(col) {
        const processedCol = { ...col };
        processedCol.type = this.convertToSQLiteType(col.type);
        const options = [];
        if (col.constraints) {
            const constraints = col.constraints.toUpperCase().split(' ');
            if (constraints.includes('PRIMARY')) {
                options.push('PRIMARY KEY');
                processedCol.primary_key = true;
            }
            if (constraints.includes('AUTO_INCREMENT') ||
                constraints.includes('AUTOINCREMENT')) {
                if (processedCol.primary_key)
                    options.push('AUTOINCREMENT');
                processedCol.auto_increment = true;
            }
            if (constraints.includes('NOT') && constraints.includes('NULL')) {
                options.push('NOT NULL');
                processedCol.nullable = false;
            }
            if (constraints.includes('UNIQUE')) {
                if (!processedCol.primary_key)
                    options.push('UNIQUE');
                processedCol.unique = true;
            }
            const defaultIndex = constraints.indexOf('DEFAULT');
            if (defaultIndex !== -1 && constraints.length > defaultIndex + 1) {
                const defaultValue = constraints[defaultIndex + 1];
                options.push(`DEFAULT ${defaultValue}`);
                processedCol.default = defaultValue;
            }
        }
        processedCol.option_key = options.join(' ').trim();
        return processedCol;
    }
    // ===========================================
    // SCHEMA INITIALIZATION FROM JSON
    // ===========================================
    async initializeFromSchema(schema) {
        if (!this.isConnected())
            throw new Error('Database is not connected. Call connect() first.');
        this.log(`Initializing database from schema: ${schema.database_name}`);
        if (schema.type_mapping)
            this.setTypeMappingConfig(schema.type_mapping);
        try {
            await this.runSql('PRAGMA foreign_keys = ON');
            await this.beginTransaction();
            for (const [tableName, tableConfig] of Object.entries(schema.schemas)) {
                const tableDefinition = {
                    name: tableName,
                    cols: tableConfig.cols.map(col => this.processColumnDefinition(col)),
                    description: tableConfig.description,
                    indexes: tableConfig.indexes,
                    foreign_keys: tableConfig.foreign_keys,
                };
                await this.createTableWithForeignKeys(tableDefinition);
                this.log(`Created table: ${tableName}`);
            }
            for (const [tableName, tableConfig] of Object.entries(schema.schemas)) {
                if (tableConfig.indexes && tableConfig.indexes.length > 0) {
                    await this.createIndexesForTable(tableName, tableConfig.indexes);
                }
            }
            await this.commitTransaction();
            this.log('Database schema initialized successfully from JSON config.');
        }
        catch (error) {
            await this.rollbackTransaction();
            this.logError('Failed to initialize database schema:', error);
            throw error;
        }
    }
    async createTableWithForeignKeys(table) {
        const columnDefs = table.cols.map(col => `${col.name} ${col.type} ${col.option_key || ''}`.trim());
        const foreignKeyDefs = [];
        if (table.foreign_keys) {
            for (const fk of table.foreign_keys) {
                let fkSql = `FOREIGN KEY (${fk.column}) REFERENCES ${fk.references.table}(${fk.references.column})`;
                if (fk.on_delete)
                    fkSql += ` ON DELETE ${fk.on_delete}`;
                if (fk.on_update)
                    fkSql += ` ON UPDATE ${fk.on_update}`;
                foreignKeyDefs.push(fkSql);
            }
        }
        const allDefs = [...columnDefs, ...foreignKeyDefs];
        let sql = `CREATE TABLE IF NOT EXISTS ${table.name} (${allDefs.join(', ')})`;
        const result = await this.runSql(sql);
        this.log(`Created table ${table.name} with foreign keys`);
        return result;
    }
    // ===========================================
    // CONNECTION & TRANSACTION
    // ===========================================
    isConnected() {
        return this.isOpen && !!this.db;
    }
    async beginTransaction() {
        if (this.inTransaction)
            throw new Error('Transaction already in progress');
        await this.runSql('BEGIN TRANSACTION');
        this.inTransaction = true;
    }
    async commitTransaction() {
        if (!this.inTransaction)
            throw new Error('No transaction in progress');
        await this.runSql('COMMIT');
        this.inTransaction = false;
    }
    async rollbackTransaction() {
        if (!this.inTransaction)
            throw new Error('No transaction in progress');
        await this.runSql('ROLLBACK');
        this.inTransaction = false;
    }
    // ===========================================
    // TABLE & INDEX MANAGEMENT
    // ===========================================
    async getDatabaseInfo() {
        const tables = await this.getRsts("SELECT name FROM sqlite_master WHERE type='table'");
        const version = await this.getRst('PRAGMA user_version');
        return {
            name: this.dbName,
            tables: tables.map(t => t.name),
            isConnected: this.isConnected(),
            version: version.user_version,
        };
    }
    async getTableInfo(tableName) {
        return this.getRsts(`PRAGMA table_info(${tableName})`);
    }
    async dropTable(tableName) {
        const sql = `DROP TABLE IF EXISTS ${tableName}`;
        return this.runSql(sql);
    }
    async createIndexesForTable(tableName, indexes) {
        for (const index of indexes)
            await this.createIndexFromDefinition(tableName, index);
    }
    async createIndexFromDefinition(tableName, indexDef) {
        const columns = indexDef.columns.join(', ');
        const isUnique = indexDef.unique || false;
        const sql = `CREATE ${isUnique ? 'UNIQUE' : ''} INDEX IF NOT EXISTS ${indexDef.name} ON ${tableName} (${columns})`;
        return this.runSql(sql);
    }
    // ===========================================
    // CRUD OPERATIONS
    // ===========================================
    async insert(insertTable) {
        const validCols = insertTable.cols.filter(col => col.value !== undefined && col.value !== null);
        if (validCols.length === 0)
            throw new Error('No valid columns to insert');
        const columnNames = validCols.map(col => col.name).join(', ');
        const placeholders = validCols.map(() => '?').join(', ');
        const params = validCols.map(col => typeof col.value === 'object' ? JSON.stringify(col.value) : col.value);
        const sql = `INSERT INTO ${insertTable.name} (${columnNames}) VALUES (${placeholders})`;
        return this.runSql(sql, params);
    }
    async update(updateTable) {
        const setCols = updateTable.cols.filter(col => col.value !== undefined &&
            !updateTable.wheres?.some(w => w.name === col.name));
        if (setCols.length === 0)
            throw new Error('No columns to update');
        const setClause = setCols.map(col => `${col.name} = ?`).join(', ');
        const params = setCols.map(col => typeof col.value === 'object' ? JSON.stringify(col.value) : col.value);
        let sql = `UPDATE ${updateTable.name} SET ${setClause}`;
        const whereClause = this.buildWhereClause(updateTable.wheres);
        if (!whereClause.sql)
            throw new Error('WHERE clause is required for UPDATE operation');
        sql += whereClause.sql;
        params.push(...whereClause.params);
        return this.runSql(sql, params);
    }
    async delete(deleteTable) {
        let sql = `DELETE FROM ${deleteTable.name}`;
        const whereClause = this.buildWhereClause(deleteTable.wheres);
        if (!whereClause.sql)
            throw new Error('WHERE clause is required for DELETE operation');
        sql += whereClause.sql;
        return this.runSql(sql, whereClause.params);
    }
    async select(selectTable) {
        const { sql, params } = this.buildSelectQuery(selectTable, ' LIMIT 1');
        return this.getRst(sql, params);
    }
    async selectAll(selectTable) {
        const { sql, params } = this.buildSelectQuery(selectTable);
        return this.getRsts(sql, params);
    }
    convertJsonToQueryTable(tableName, json, idFields = ['id']) {
        const queryTable = { name: tableName, cols: [], wheres: [] };
        for (const [key, value] of Object.entries(json)) {
            queryTable.cols.push({ name: key, value });
            if (idFields.includes(key) && value !== undefined) {
                queryTable.wheres?.push({ name: key, value });
            }
        }
        return queryTable;
    }
    // ===========================================
    // UTILITY & CORE METHODS
    // ===========================================
    buildSelectQuery(selectTable, suffix = '') {
        const columns = selectTable.cols.length > 0
            ? selectTable.cols.map(col => col.name).join(', ')
            : '*';
        let sql = `SELECT ${columns} FROM ${selectTable.name}`;
        const whereClause = this.buildWhereClause(selectTable.wheres);
        sql += whereClause.sql;
        if (selectTable.orderbys?.length) {
            const orderBy = selectTable.orderbys
                .map(o => `${o.name} ${o.direction || 'ASC'}`)
                .join(', ');
            sql += ` ORDER BY ${orderBy}`;
        }
        if (selectTable.limitOffset) {
            if (selectTable.limitOffset.limit)
                sql += ` LIMIT ${selectTable.limitOffset.limit}`;
            if (selectTable.limitOffset.offset)
                sql += ` OFFSET ${selectTable.limitOffset.offset}`;
        }
        sql += suffix;
        return { sql, params: whereClause.params };
    }
    buildWhereClause(wheres, clause = 'WHERE') {
        if (!wheres || wheres.length === 0)
            return { sql: '', params: [] };
        const conditions = [];
        const params = [];
        for (const where of wheres) {
            conditions.push(`${where.name} = ?`);
            params.push(where.value);
        }
        return { sql: ` ${clause} ${conditions.join(' AND ')}`, params };
    }
    async runSql(sql, params = []) {
        if (!this.db || !this.isOpen)
            throw new Error('Database is not initialized');
        try {
            this.log(`Executing SQL: ${sql}`, params);
            await this.db.executeSql(sql, params);
            return `Executed: ${sql}`;
        }
        catch (error) {
            this.logError(`SQL execution error: ${sql}`, error);
            throw error;
        }
    }
    async getRst(sql, params = []) {
        if (!this.db || !this.isOpen)
            throw new Error('Database is not initialized');
        try {
            const results = await this.db.executeSql(sql, params);
            if (results.length > 0 && results[0].rows.length > 0) {
                return results[0].rows.item(0);
            }
            return {};
        }
        catch (error) {
            this.logError(`SQL query error: ${sql}`, error);
            throw error;
        }
    }
    async getRsts(sql, params = []) {
        if (!this.db || !this.isOpen)
            throw new Error('Database is not initialized');
        try {
            const results = await this.db.executeSql(sql, params);
            const rows = [];
            if (results.length > 0) {
                const result = results[0];
                for (let i = 0; i < result.rows.length; i++) {
                    rows.push(result.rows.item(i));
                }
            }
            return rows;
        }
        catch (error) {
            this.logError(`SQL query error: ${sql}`, error);
            throw error;
        }
    }
    async close() {
        if (this.db && this.isOpen) {
            try {
                await this.db.close();
                this.log(`Database closed`);
                this.isOpen = false;
                this.db = null;
            }
            catch (err) {
                this.logError('Error closing database:', err);
                throw err;
            }
        }
    }
}
exports.SQLiteDAO = SQLiteDAO;
exports.default = SQLiteDAO;
