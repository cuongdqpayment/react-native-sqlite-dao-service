export interface TypeMappingConfig {
    type_mapping: {
        [targetType: string]: {
            [sourceType: string]: string;
        };
    };
}
export interface ColumnDefinition {
    name: string;
    type: string;
    option_key?: string;
    description?: string;
    nullable?: boolean;
    default?: any;
    primary_key?: boolean;
    auto_increment?: boolean;
    unique?: boolean;
    constraints?: string;
    length?: number;
}
export interface Column {
    name: string;
    value?: any;
}
export interface WhereClause {
    name: string;
    value: any;
    operator?: string;
}
export interface OrderByClause {
    name: string;
    direction?: 'ASC' | 'DESC';
}
export interface LimitOffset {
    limit?: number;
    offset?: number;
}
export interface QueryTable {
    name: string;
    cols: Column[];
    wheres?: WhereClause[];
    orderbys?: OrderByClause[];
    limitOffset?: LimitOffset;
}
export interface JoinClause {
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    table: string;
    on: string;
}
export interface IndexDefinition {
    name: string;
    columns: string[];
    unique?: boolean;
    description?: string;
}
export type ForeignKeyAction = 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION' | undefined;
export interface ForeignKeyDefinition {
    name: string;
    column: string;
    references: {
        table: string;
        column: string;
    };
    on_delete?: string | ForeignKeyAction;
    on_update?: string | ForeignKeyAction;
    description?: string;
}
export interface TableDefinition {
    name: string;
    cols: ColumnDefinition[];
    description?: string;
    indexes?: IndexDefinition[];
    foreign_keys?: ForeignKeyDefinition[];
}
export interface DatabaseSchemaWithTypeMapping {
    version: string;
    database_name: string;
    description?: string;
    type_mapping?: TypeMappingConfig['type_mapping'];
    schemas: Record<string, {
        description?: string;
        cols: ColumnDefinition[];
        indexes?: IndexDefinition[];
        foreign_keys?: ForeignKeyDefinition[];
    }>;
}
export interface TransactionOperation {
    type: 'insert' | 'update' | 'delete' | 'select';
    table: QueryTable;
}
export declare class SQLiteDAO {
    private db;
    private isOpen;
    private isDebug;
    private dbName;
    private inTransaction;
    private typeMappingConfig;
    constructor(dbFilePath: string, debug?: boolean);
    /**
     * Establishes a connection to the database. Must be called after instantiation.
     */
    connect(): Promise<void>;
    private log;
    private logError;
    setTypeMappingConfig(config: TypeMappingConfig['type_mapping']): void;
    private convertToSQLiteType;
    private getDefaultSQLiteType;
    private processColumnDefinition;
    initializeFromSchema(schema: DatabaseSchemaWithTypeMapping): Promise<void>;
    createTableWithForeignKeys(table: TableDefinition): Promise<string>;
    isConnected(): boolean;
    beginTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    getDatabaseInfo(): Promise<any>;
    getTableInfo(tableName: string): Promise<any[]>;
    dropTable(tableName: string): Promise<string>;
    private createIndexesForTable;
    createIndexFromDefinition(tableName: string, indexDef: IndexDefinition): Promise<string>;
    insert(insertTable: QueryTable): Promise<string>;
    update(updateTable: QueryTable): Promise<string>;
    delete(deleteTable: QueryTable): Promise<string>;
    select(selectTable: QueryTable): Promise<Record<string, any>>;
    selectAll(selectTable: QueryTable): Promise<Record<string, any>[]>;
    convertJsonToQueryTable(tableName: string, json: Record<string, any>, idFields?: string[]): QueryTable;
    private buildSelectQuery;
    private buildWhereClause;
    runSql(sql: string, params?: any[]): Promise<string>;
    getRst(sql: string, params?: any[]): Promise<Record<string, any>>;
    getRsts(sql: string, params?: any[]): Promise<Record<string, any>[]>;
    close(): Promise<void>;
}
export default SQLiteDAO;
