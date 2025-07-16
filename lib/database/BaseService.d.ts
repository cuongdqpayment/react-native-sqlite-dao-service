import { SQLiteDAO, QueryTable, OrderByClause } from './SQLiteDAO';
export interface ServiceStatus {
    schemaName: string;
    isOpened: boolean;
    isInitialized: boolean;
    hasDao: boolean;
}
export interface HealthCheckResult {
    healthy: boolean;
    schemaName: string;
    recordCount?: number;
    error?: string;
    timestamp: string;
}
export interface FindOptions {
    orderBy?: OrderByClause[];
    limit?: number;
    offset?: number;
    columns?: string[];
}
export type ErrorHandler = (error: Error) => void;
export type EventHandler = (data: any) => void;
export declare class BaseService {
    protected schemaName: string;
    protected tableName: string;
    protected dao: SQLiteDAO | null;
    protected isOpened: boolean;
    protected isInitialized: boolean;
    protected errorHandlers: Map<string, ErrorHandler>;
    protected eventListeners: Map<string, EventHandler[]>;
    protected primaryKeyFields: string[];
    private cache;
    constructor(schemaName: string, tableName?: string);
    private bindMethods;
    setPrimaryKeyFields(fields: string[]): this;
    init(): Promise<this>;
    protected buildSelectTable(conditions?: Record<string, any>, options?: FindOptions): QueryTable;
    protected buildDataTable(data: Record<string, any>): QueryTable;
    findAll(conditions?: Record<string, any>, options?: FindOptions): Promise<any[]>;
    findById(id: string | number): Promise<any>;
    findFirst(conditions?: Record<string, any>): Promise<any>;
    create(data: Record<string, any>): Promise<any>;
    update(id: string | number, data: Record<string, any>): Promise<any>;
    delete(id: string | number): Promise<boolean>;
    bulkCreate(dataArray: Record<string, any>[]): Promise<any[]>;
    count(conditions?: Record<string, any>): Promise<number>;
    executeTransaction(callback: () => Promise<any>): Promise<any>;
    getAll(conditions?: Record<string, any>, options?: FindOptions): Promise<any[]>;
    getById(id: string | number): Promise<any>;
    getFirst(conditions?: Record<string, any>): Promise<any>;
    on(event: string, handler: EventHandler): this;
    off(event: string, handler: EventHandler): this;
    protected _emit(event: string, data: any): void;
    setErrorHandler(errorType: string, handler: ErrorHandler): this;
    protected _handleError(errorType: string, error: Error): void;
    protected _validateData(data: any): void;
    protected _ensureInitialized(): Promise<void>;
    getDatabaseInfo(): Promise<any>;
    getTableInfo(): Promise<any[]>;
    close(): Promise<boolean>;
    getStatus(): ServiceStatus;
    healthCheck(): Promise<HealthCheckResult>;
}
