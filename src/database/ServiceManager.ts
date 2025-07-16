// ServiceManager.ts - Quản lý tập trung các service cho nhiều schemas và tables
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
export class ServiceManager {
  private static instance: ServiceManager;
  private services: Map<string, BaseService> = new Map();
  private schemaConfigs: Map<string, SchemaConfig> = new Map();
  private serviceConfigs: Map<string, ServiceConfig> = new Map();
  private eventHandlers: Map<string, ServiceEventHandler[]> = new Map();
  private initialized: boolean = false;

  private constructor() {
    this.bindMethods();
  }

  // Singleton pattern
  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  private bindMethods(): void {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this));
    methods.forEach(method => {
      if (
        typeof (this as any)[method] === 'function' &&
        method !== 'constructor'
      ) {
        (this as any)[method] = (this as any)[method].bind(this);
      }
    });
  }

  // Tạo service key duy nhất: schema:table
  private createServiceKey(schemaName: string, tableName: string): string {
    return `${schemaName}:${tableName}`;
  }

  // Đăng ký cấu hình schema với các tables
  registerSchema(config: SchemaConfig): this {
    // Validate config
    if (!config.schemaName) {
      throw new Error('Schema name is required');
    }

    if (!config.tables || config.tables.length === 0) {
      throw new Error('At least one table must be configured for schema');
    }

    // Lưu schema config
    this.schemaConfigs.set(config.schemaName, config);

    // Tạo service config cho từng table trong schema
    config.tables.forEach(tableConfig => {
      const serviceConfig: ServiceConfig = {
        schemaName: config.schemaName,
        tableName: tableConfig.tableName,
        primaryKeyFields: tableConfig.primaryKeyFields || config.defaultPrimaryKeyFields || ['id'],
        autoInit: tableConfig.autoInit !== undefined ? tableConfig.autoInit : (config.defaultAutoInit || false),
        serviceClass: tableConfig.serviceClass || config.defaultServiceClass || BaseService,
      };

      const serviceKey = this.createServiceKey(config.schemaName, tableConfig.tableName);
      this.serviceConfigs.set(serviceKey, serviceConfig);
    });

    this.emit('SCHEMA_REGISTERED', {
      serviceKey: `${config.schemaName}:*`,
      schemaName: config.schemaName,
      tableName: '*',
      data: { 
        tablesCount: config.tables.length,
        tables: config.tables.map(t => t.tableName)
      },
    });

    return this;
  }

  // Đăng ký nhiều schemas cùng lúc
  registerSchemas(configs: SchemaConfig[]): this {
    configs.forEach(config => this.registerSchema(config));
    return this;
  }

  // Đăng ký service đơn lẻ (nếu không muốn dùng schema config)
  registerService(config: ServiceConfig): this {
    const serviceKey = this.createServiceKey(config.schemaName, config.tableName);
    
    // Validate config
    if (!config.schemaName || !config.tableName) {
      throw new Error('Both schema name and table name are required');
    }

    const serviceConfig: ServiceConfig = {
      primaryKeyFields: ['id'],
      autoInit: false,
      serviceClass: BaseService,
      ...config,
    };

    this.serviceConfigs.set(serviceKey, serviceConfig);
    return this;
  }

  // Tạo service instance
  async createService(schemaName: string, tableName: string): Promise<BaseService> {
    const serviceKey = this.createServiceKey(schemaName, tableName);
    
    // Kiểm tra xem service đã tồn tại chưa
    if (this.services.has(serviceKey)) {
      return this.services.get(serviceKey)!;
    }

    // Lấy config hoặc tạo config mặc định
    const config = this.serviceConfigs.get(serviceKey) || {
      schemaName,
      tableName,
      primaryKeyFields: ['id'],
      autoInit: false,
      serviceClass: BaseService,
    };

    try {
      // Tạo service instance
      const ServiceClass = config.serviceClass || BaseService;
      const service = new ServiceClass(schemaName, tableName);

      // Thiết lập primary key fields
      if (config.primaryKeyFields) {
        service.setPrimaryKeyFields(config.primaryKeyFields);
      }

      // Lưu service vào map
      this.services.set(serviceKey, service);

      // Tự động khởi tạo nếu được cấu hình
      if (config.autoInit) {
        await service.init();
      }

      this.emit('SERVICE_CREATED', {
        serviceKey,
        schemaName,
        tableName,
        data: { autoInit: config.autoInit },
      });

      return service;
    } catch (error) {
      this.emit('SERVICE_ERROR', {
        serviceKey,
        schemaName,
        tableName,
        error: error as Error,
      });
      throw error;
    }
  }

  // Lấy service (tự động tạo nếu chưa tồn tại)
  async getService(schemaName: string, tableName: string): Promise<BaseService> {
    const serviceKey = this.createServiceKey(schemaName, tableName);
    
    if (this.services.has(serviceKey)) {
      return this.services.get(serviceKey)!;
    }

    return await this.createService(schemaName, tableName);
  }

  // Lấy service đã tồn tại (không tự động tạo)
  getExistingService(schemaName: string, tableName: string): BaseService | null {
    const serviceKey = this.createServiceKey(schemaName, tableName);
    return this.services.get(serviceKey) || null;
  }

  // Khởi tạo service
  async initService(schemaName: string, tableName: string): Promise<BaseService> {
    const service = await this.getService(schemaName, tableName);
    await service.init();
    
    const serviceKey = this.createServiceKey(schemaName, tableName);
    this.emit('SERVICE_INITIALIZED', {
      serviceKey,
      schemaName,
      tableName,
    });

    return service;
  }

  // Khởi tạo tất cả services trong một schema
  async initSchema(schemaName: string): Promise<void> {
    const schemaConfig = this.schemaConfigs.get(schemaName);
    if (!schemaConfig) {
      throw new Error(`Schema config not found: ${schemaName}`);
    }

    const initPromises = schemaConfig.tables.map(async (tableConfig) => {
      try {
        await this.initService(schemaName, tableConfig.tableName);
      } catch (error) {
        this.emit('SERVICE_ERROR', {
          serviceKey: this.createServiceKey(schemaName, tableConfig.tableName),
          schemaName,
          tableName: tableConfig.tableName,
          error: error as Error,
        });
      }
    });

    await Promise.all(initPromises);
  }

  // Khởi tạo tất cả services
  async initAllServices(): Promise<void> {
    const initPromises = Array.from(this.services.entries()).map(
      async ([serviceKey, service]) => {
        try {
          await service.init();
          
          const [schemaName, tableName] = serviceKey.split(':');
          this.emit('SERVICE_INITIALIZED', {
            serviceKey,
            schemaName,
            tableName,
          });
        } catch (error) {
          const [schemaName, tableName] = serviceKey.split(':');
          this.emit('SERVICE_ERROR', {
            serviceKey,
            schemaName,
            tableName,
            error: error as Error,
          });
        }
      }
    );

    await Promise.all(initPromises);
    this.initialized = true;
  }

  // Đóng service
  async closeService(schemaName: string, tableName: string): Promise<boolean> {
    const serviceKey = this.createServiceKey(schemaName, tableName);
    const service = this.services.get(serviceKey);
    
    if (!service) {
      return false;
    }

    try {
      await service.close();
      this.services.delete(serviceKey);
      
      this.emit('SERVICE_CLOSED', {
        serviceKey,
        schemaName,
        tableName,
      });

      return true;
    } catch (error) {
      this.emit('SERVICE_ERROR', {
        serviceKey,
        schemaName,
        tableName,
        error: error as Error,
      });
      return false;
    }
  }

  // Đóng tất cả services trong một schema
  async closeSchema(schemaName: string): Promise<void> {
    const schemaServices = this.getServicesBySchema(schemaName);
    
    const closePromises = Array.from(schemaServices.entries()).map(
      async ([serviceKey, service]) => {
        try {
          await service.close();
          this.services.delete(serviceKey);
          
          const [, tableName] = serviceKey.split(':');
          this.emit('SERVICE_CLOSED', {
            serviceKey,
            schemaName,
            tableName,
          });
        } catch (error) {
          const [, tableName] = serviceKey.split(':');
          this.emit('SERVICE_ERROR', {
            serviceKey,
            schemaName,
            tableName,
            error: error as Error,
          });
        }
      }
    );

    await Promise.all(closePromises);
  }

  // Đóng tất cả services
  async closeAllServices(): Promise<void> {
    const closePromises = Array.from(this.services.entries()).map(
      async ([serviceKey, service]) => {
        try {
          await service.close();
          
          const [schemaName, tableName] = serviceKey.split(':');
          this.emit('SERVICE_CLOSED', {
            serviceKey,
            schemaName,
            tableName,
          });
        } catch (error) {
          const [schemaName, tableName] = serviceKey.split(':');
          this.emit('SERVICE_ERROR', {
            serviceKey,
            schemaName,
            tableName,
            error: error as Error,
          });
        }
      }
    );

    await Promise.all(closePromises);
    this.services.clear();
    this.initialized = false;
  }

  // Lấy danh sách tất cả services
  getAllServices(): Map<string, BaseService> {
    return new Map(this.services);
  }

  // Lấy danh sách services theo schema
  getServicesBySchema(schemaName: string): Map<string, BaseService> {
    const schemaServices = new Map<string, BaseService>();
    
    for (const [serviceKey, service] of this.services) {
      if (serviceKey.startsWith(`${schemaName}:`)) {
        schemaServices.set(serviceKey, service);
      }
    }
    
    return schemaServices;
  }

  // Lấy danh sách schemas đã đăng ký
  getRegisteredSchemas(): string[] {
    return Array.from(this.schemaConfigs.keys());
  }

  // Lấy danh sách tables trong schema
  getTablesInSchema(schemaName: string): string[] {
    const schemaConfig = this.schemaConfigs.get(schemaName);
    if (!schemaConfig) {
      return [];
    }
    return schemaConfig.tables.map(table => table.tableName);
  }

  // Lấy trạng thái tổng quan
  getStatus(): ServiceManagerStatus {
    const services = Array.from(this.services.values());
    const schemas = Array.from(this.schemaConfigs.keys());
    
    const schemaStatuses: SchemaStatus[] = schemas.map(schemaName => {
      const schemaServices = this.getServicesBySchema(schemaName);
      const schemaServiceArray = Array.from(schemaServices.values());
      
      const tableStatuses: TableStatus[] = Array.from(schemaServices.entries()).map(([serviceKey, service]) => {
        const tableName = serviceKey.split(':')[1];
        return {
          tableName,
          serviceStatus: service.getStatus(),
        };
      });

      return {
        schemaName,
        totalTables: schemaServiceArray.length,
        activeTables: schemaServiceArray.filter(s => s.getStatus().isOpened).length,
        initializedTables: schemaServiceArray.filter(s => s.getStatus().isInitialized).length,
        tables: tableStatuses,
      };
    });

    return {
      totalServices: services.length,
      activeServices: services.filter(s => s.getStatus().isOpened).length,
      initializedServices: services.filter(s => s.getStatus().isInitialized).length,
      totalSchemas: schemas.length,
      schemas: schemaStatuses,
    };
  }

  // Kiểm tra sức khỏe tất cả services
  async healthCheck(): Promise<ServiceHealthReport> {
    const schemas = Array.from(this.schemaConfigs.keys());
    
    const schemaHealthPromises = schemas.map(async (schemaName): Promise<SchemaHealthReport> => {
      const schemaServices = this.getServicesBySchema(schemaName);
      const healthPromises = Array.from(schemaServices.values()).map(service => service.healthCheck());
      
      const results = await Promise.all(healthPromises);
      const healthyCount = results.filter(r => r.healthy).length;
      
      return {
        schemaName,
        overall: healthyCount === results.length,
        totalTables: results.length,
        healthyTables: healthyCount,
        unhealthyTables: results.length - healthyCount,
        tables: results,
      };
    });

    const schemaHealthReports = await Promise.all(schemaHealthPromises);
    const totalServices = schemaHealthReports.reduce((sum, schema) => sum + schema.totalTables, 0);
    const healthyServices = schemaHealthReports.reduce((sum, schema) => sum + schema.healthyTables, 0);
    
    return {
      overall: schemaHealthReports.every(schema => schema.overall),
      totalServices,
      healthyServices,
      unhealthyServices: totalServices - healthyServices,
      schemas: schemaHealthReports,
      timestamp: new Date().toISOString(),
    };
  }

  // Thực hiện transaction trên nhiều services
  async executeMultiServiceTransaction(
    serviceKeys: string[],
    callback: (services: BaseService[]) => Promise<any>
  ): Promise<any> {
    const services = serviceKeys.map(key => {
      const service = this.services.get(key);
      if (!service) {
        throw new Error(`Service not found: ${key}`);
      }
      return service;
    });

    // Đảm bảo tất cả services đã được khởi tạo
    for (const service of services) {
      await service.init();
    }

    // Thực hiện transaction trên service đầu tiên
    // Vì SQLiteDAO chỉ hỗ trợ transaction trong cùng một database connection
    const primaryService = services[0];
    
    try {
      return await primaryService.executeTransaction(async () => {
        return await callback(services);
      });
    } catch (error) {
      // Error handling được xử lý bởi BaseService
      throw error;
    }
  }

  // Thực hiện transaction trên tất cả services trong schema
  async executeSchemaTransaction(
    schemaName: string,
    callback: (services: Map<string, BaseService>) => Promise<any>
  ): Promise<any> {
    const schemaServices = this.getServicesBySchema(schemaName);
    
    if (schemaServices.size === 0) {
      throw new Error(`No services found for schema: ${schemaName}`);
    }

    const services = Array.from(schemaServices.values());
    
    // Đảm bảo tất cả services đã được khởi tạo
    for (const service of services) {
      await service.init();
    }

    // Thực hiện transaction trên service đầu tiên của schema
    const primaryService = services[0];
    
    try {
      return await primaryService.executeTransaction(async () => {
        return await callback(schemaServices);
      });
    } catch (error) {
      // Error handling được xử lý bởi BaseService
      throw error;
    }
  }

  // Event handling
  on(event: string, handler: ServiceEventHandler): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
    return this;
  }

  off(event: string, handler: ServiceEventHandler): this {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  private emit(
    type: ServiceEvent['type'],
    data: Omit<ServiceEvent, 'type' | 'timestamp'>
  ): void {
    const event: ServiceEvent = {
      ...data,
      type,
      timestamp: new Date().toISOString(),
    };

    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in ServiceManager event handler for ${type}:`, error);
        }
      });
    }

    // Emit to general event handlers
    const generalHandlers = this.eventHandlers.get('*');
    if (generalHandlers) {
      generalHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in ServiceManager general event handler:`, error);
        }
      });
    }
  }

  // Utility methods
  hasService(schemaName: string, tableName: string): boolean {
    const serviceKey = this.createServiceKey(schemaName, tableName);
    return this.services.has(serviceKey);
  }

  hasSchema(schemaName: string): boolean {
    return this.schemaConfigs.has(schemaName);
  }

  getServiceCount(): number {
    return this.services.size;
  }

  getSchemaCount(): number {
    return this.schemaConfigs.size;
  }

  // Cleanup
  async destroy(): Promise<void> {
    await this.closeAllServices();
    this.schemaConfigs.clear();
    this.serviceConfigs.clear();
    this.eventHandlers.clear();
    this.initialized = false;
  }

  // Getter cho trạng thái initialized
  get isInitialized(): boolean {
    return this.initialized;
  }
}