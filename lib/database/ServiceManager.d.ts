import { BaseService, ServiceStatus, HealthCheckResult } from './BaseService';
export interface TableConfig {
    tableName: string;
    primaryKeyFields?: string[];
    autoInit?: boolean;
    serviceClass?: new (schemaName: string, tableName: string) => BaseService;
}
export interface SchemaConfig {
    schemaName: string;
    tables: TableConfig[];
    defaultPrimaryKeyFields?: string[];
    defaultAutoInit?: boolean;
    defaultServiceClass?: new (schemaName: string, tableName: string) => BaseService;
}
export interface ServiceConfig {
    schemaName: string;
    tableName: string;
    primaryKeyFields?: string[];
    autoInit?: boolean;
    serviceClass?: new (schemaName: string, tableName: string) => BaseService;
}
export interface ServiceManagerStatus {
    totalServices: number;
    activeServices: number;
    initializedServices: number;
    totalSchemas: number;
    schemas: SchemaStatus[];
}
export interface SchemaStatus {
    schemaName: string;
    totalTables: number;
    activeTables: number;
    initializedTables: number;
    tables: TableStatus[];
}
export interface TableStatus {
    tableName: string;
    serviceStatus: ServiceStatus;
}
export interface ServiceHealthReport {
    overall: boolean;
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    schemas: SchemaHealthReport[];
    timestamp: string;
}
export interface SchemaHealthReport {
    schemaName: string;
    overall: boolean;
    totalTables: number;
    healthyTables: number;
    unhealthyTables: number;
    tables: HealthCheckResult[];
}
export type ServiceEventHandler = (event: ServiceEvent) => void;
export interface ServiceEvent {
    type: 'SCHEMA_REGISTERED' | 'SERVICE_CREATED' | 'SERVICE_INITIALIZED' | 'SERVICE_CLOSED' | 'SERVICE_ERROR';
    serviceKey: string;
    schemaName: string;
    tableName: string;
    data?: any;
    error?: Error;
    timestamp: string;
}
/**
 * ServiceManager: là lớp quản lý service trung tâm cho nhiều schema và bảng,
 * hoạt động như một registry toàn cục trong app
 *
 */
export declare class ServiceManager {
    private static instance;
    private services;
    private schemaConfigs;
    private serviceConfigs;
    private eventHandlers;
    private initialized;
    private constructor();
    static getInstance(): ServiceManager;
    private bindMethods;
    private createServiceKey;
    registerSchema(config: SchemaConfig): this;
    registerSchemas(configs: SchemaConfig[]): this;
    registerService(config: ServiceConfig): this;
    createService(schemaName: string, tableName: string): Promise<BaseService>;
    getService(schemaName: string, tableName: string): Promise<BaseService>;
    getExistingService(schemaName: string, tableName: string): BaseService | null;
    initService(schemaName: string, tableName: string): Promise<BaseService>;
    initSchema(schemaName: string): Promise<void>;
    initAllServices(): Promise<void>;
    closeService(schemaName: string, tableName: string): Promise<boolean>;
    closeSchema(schemaName: string): Promise<void>;
    closeAllServices(): Promise<void>;
    getAllServices(): Map<string, BaseService>;
    getServicesBySchema(schemaName: string): Map<string, BaseService>;
    getRegisteredSchemas(): string[];
    getTablesInSchema(schemaName: string): string[];
    getStatus(): ServiceManagerStatus;
    healthCheck(): Promise<ServiceHealthReport>;
    executeMultiServiceTransaction(serviceKeys: string[], callback: (services: BaseService[]) => Promise<any>): Promise<any>;
    executeSchemaTransaction(schemaName: string, callback: (services: Map<string, BaseService>) => Promise<any>): Promise<any>;
    on(event: string, handler: ServiceEventHandler): this;
    off(event: string, handler: ServiceEventHandler): this;
    private emit;
    hasService(schemaName: string, tableName: string): boolean;
    hasSchema(schemaName: string): boolean;
    getServiceCount(): number;
    getSchemaCount(): number;
    destroy(): Promise<void>;
    get isInitialized(): boolean;
}
