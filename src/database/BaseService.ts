import { SQLiteDAO, QueryTable, OrderByClause } from './SQLiteDAO';
import { DatabaseManager } from './DatabaseManager';

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

export class BaseService {
  protected schemaName: string;
  protected tableName: string;
  protected dao: SQLiteDAO | null = null;
  protected isOpened: boolean = false;
  protected isInitialized: boolean = false;
  protected errorHandlers: Map<string, ErrorHandler> = new Map();
  protected eventListeners: Map<string, EventHandler[]> = new Map();
  protected primaryKeyFields: string[] = ['id'];

  // nếu muốn catch thứ gì để lần sau khỏi select trong db thì lấy từ đây
  private cache: Map<string, any> = new Map();

  constructor(schemaName: string, tableName?: string) {
    this.schemaName = schemaName;
    this.tableName = tableName || schemaName;

    // Bind methods to preserve context
    this.bindMethods();
  }

  private bindMethods(): void {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this));
    methods.forEach((method) => {
      if (typeof (this as any)[method] === 'function' && method !== 'constructor') {
        (this as any)[method] = (this as any)[method].bind(this);
      }
    });
  }

  // Set custom primary key fields (default is ['id'])
  setPrimaryKeyFields(fields: string[]): this {
    this.primaryKeyFields = fields;
    return this;
  }

  // Initialize service and get DAO
  async init(): Promise<this> {
    try {
      if (this.isInitialized) {
        return this;
      }
      // sử dụng mở cơ sở dữ liệu nếu chưa mở kết nối
      // tức là mở đơn lẻ khi muốn dùng tránh mở nhiều csdl mà không dùng đến
      this.dao = (await DatabaseManager.getLazyLoading(this.schemaName)) as SQLiteDAO;
      if (!this.dao) {
        throw new Error(`Failed to initialize DAO for schema: ${this.schemaName}`);
      }

      this.isOpened = true;
      this.isInitialized = true;
      this._emit('initialized', { schemaName: this.schemaName });

      return this;
    } catch (error) {
      this._handleError('INIT_ERROR', error as Error);
      throw error;
    }
  }

  // Helper method to build QueryTable for select operations
  protected buildSelectTable(
    conditions: Record<string, any> = {},
    options: FindOptions = {}
  ): QueryTable {
    const queryTable: QueryTable = {
      name: this.tableName,
      cols: [],
      wheres: [],
      orderbys: options.orderBy || [],
      limitOffset: {},
    };

    // Add specific columns if requested
    if (options.columns && options.columns.length > 0) {
      queryTable.cols = options.columns.map((name) => ({ name }));
    }

    // Build WHERE conditions
    if (conditions && Object.keys(conditions).length > 0) {
      queryTable.wheres = Object.entries(conditions).map(([key, value]) => ({
        name: key,
        value,
        operator: '=',
      }));
    }

    // Set limit and offset
    if (options.limit !== undefined) {
      queryTable.limitOffset!.limit = options.limit;
    }
    if (options.offset !== undefined) {
      queryTable.limitOffset!.offset = options.offset;
    }

    return queryTable;
  }

  // Helper method to build QueryTable for insert/update operations
  protected buildDataTable(data: Record<string, any>): QueryTable {
    return this.dao!.convertJsonToQueryTable(this.tableName, data, this.primaryKeyFields);
  }

  // Generic CRUD operations
  async findAll(conditions: Record<string, any> = {}, options: FindOptions = {}): Promise<any[]> {
    await this._ensureInitialized();
    try {
      const queryTable = this.buildSelectTable(conditions, options);
      const result = await this.dao!.selectAll(queryTable);
      this._emit('dataFetched', { operation: 'findAll', count: result.length });
      return result;
    } catch (error) {
      this._handleError('FIND_ALL_ERROR', error as Error);
      throw error;
    }
  }

  async findById(id: string | number): Promise<any> {
    await this._ensureInitialized();
    try {
      if (!id) {
        throw new Error('ID is required');
      }

      const conditions = { [this.primaryKeyFields[0]]: id };
      const queryTable = this.buildSelectTable(conditions);
      const result = await this.dao!.select(queryTable);

      this._emit('dataFetched', { operation: 'findById', id });
      return result;
    } catch (error) {
      this._handleError('FIND_BY_ID_ERROR', error as Error);
      throw error;
    }
  }

  async findFirst(conditions: Record<string, any> = {}): Promise<any> {
    await this._ensureInitialized();
    try {
      const queryTable = this.buildSelectTable(conditions);
      const result = await this.dao!.select(queryTable);
      this._emit('dataFetched', { operation: 'findFirst' });
      return result;
    } catch (error) {
      this._handleError('FIND_FIRST_ERROR', error as Error);
      throw error;
    }
  }

  async create(data: Record<string, any>): Promise<any> {
    await this._ensureInitialized();
    try {
      this._validateData(data);

      const queryTable = this.buildDataTable(data);
      await this.dao!.insert(queryTable);

      // Get the created record if it has an ID
      let result = data;
      if (data[this.primaryKeyFields[0]]) {
        result = await this.findById(data[this.primaryKeyFields[0]]);
      }

      this._emit('dataCreated', { operation: 'create', data: result });
      return result;
    } catch (error) {
      this._handleError('CREATE_ERROR', error as Error);
      throw error;
    }
  }

  async update(id: string | number, data: Record<string, any>): Promise<any> {
    await this._ensureInitialized();
    try {
      if (!id) {
        throw new Error('ID is required for update');
      }
      this._validateData(data);

      // Build update data with WHERE condition
      const updateData = {
        ...data,
        [this.primaryKeyFields[0]]: id,
      };

      const queryTable = this.buildDataTable(updateData);
      await this.dao!.update(queryTable);

      // Get the updated record
      const result = await this.findById(id);
      this._emit('dataUpdated', { operation: 'update', id, data: result });
      return result;
    } catch (error) {
      this._handleError('UPDATE_ERROR', error as Error);
      throw error;
    }
  }

  async delete(id: string | number): Promise<boolean> {
    await this._ensureInitialized();
    try {
      if (!id) {
        throw new Error('ID is required for delete');
      }

      const conditions = { [this.primaryKeyFields[0]]: id };
      const queryTable = this.buildSelectTable(conditions);

      await this.dao!.delete(queryTable);
      this._emit('dataDeleted', { operation: 'delete', id });
      return true;
    } catch (error) {
      this._handleError('DELETE_ERROR', error as Error);
      throw error;
    }
  }

  async bulkCreate(dataArray: Record<string, any>[]): Promise<any[]> {
    await this._ensureInitialized();
    try {
      if (!Array.isArray(dataArray) || dataArray.length === 0) {
        throw new Error('Data must be a non-empty array');
      }

      const results: any[] = [];

      // Use transaction for bulk operations
      await this.executeTransaction(async () => {
        for (const data of dataArray) {
          this._validateData(data);
          const queryTable = this.buildDataTable(data);
          await this.dao!.insert(queryTable);
          results.push(data);
        }
      });

      this._emit('dataBulkCreated', {
        operation: 'bulkCreate',
        count: results.length,
      });
      return results;
    } catch (error) {
      this._handleError('BULK_CREATE_ERROR', error as Error);
      throw error;
    }
  }

  async count(conditions: Record<string, any> = {}): Promise<number> {
    await this._ensureInitialized();
    try {
      const queryTable = this.buildSelectTable(conditions, {
        columns: ['COUNT(*) as count'],
      });
      const result = await this.dao!.select(queryTable);
      return result.count || 0;
    } catch (error) {
      this._handleError('COUNT_ERROR', error as Error);
      throw error;
    }
  }

  // Transaction support
  async executeTransaction(callback: () => Promise<any>): Promise<any> {
    await this._ensureInitialized();
    try {
      await this.dao!.beginTransaction();
      const result = await callback();
      await this.dao!.commitTransaction();

      this._emit('transactionCompleted', { operation: 'transaction' });
      return result;
    } catch (error) {
      try {
        await this.dao!.rollbackTransaction();
      } catch (rollbackError) {
        this._handleError('ROLLBACK_ERROR', rollbackError as Error);
      }
      this._handleError('TRANSACTION_ERROR', error as Error);
      throw error;
    }
  }

  // Legacy method aliases for backward compatibility
  async getAll(conditions: Record<string, any> = {}, options: FindOptions = {}): Promise<any[]> {
    return this.findAll(conditions, options);
  }

  async getById(id: string | number): Promise<any> {
    return this.findById(id);
  }

  async getFirst(conditions: Record<string, any> = {}): Promise<any> {
    return this.findFirst(conditions);
  }

  // Event handling
  on(event: string, handler: EventHandler): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
    return this;
  }

  off(event: string, handler: EventHandler): this {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  protected _emit(event: string, data: any): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  // Error handling
  setErrorHandler(errorType: string, handler: ErrorHandler): this {
    this.errorHandlers.set(errorType, handler);
    return this;
  }

  protected _handleError(errorType: string, error: Error): void {
    const handler = this.errorHandlers.get(errorType);
    if (handler) {
      try {
        handler(error);
      } catch (handlerError) {
        console.error(`Error in error handler for ${errorType}:`, handlerError);
      }
    }

    // Default error logging
    console.error(`${this.schemaName} Service Error [${errorType}]:`, error);
    this._emit('error', { errorType, error });
  }

  // Validation (override in subclasses)
  protected _validateData(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be a valid object');
    }
  }

  // Utility methods
  protected async _ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  // Get database info
  async getDatabaseInfo(): Promise<any> {
    await this._ensureInitialized();
    return this.dao!.getDatabaseInfo();
  }

  // Get table info
  async getTableInfo(): Promise<any[]> {
    await this._ensureInitialized();
    return this.dao!.getTableInfo(this.tableName);
  }

  // Cleanup and resource management
  async close(): Promise<boolean> {
    try {
      if (this.dao) {
        await this.dao.close();
      }

      this.isOpened = false;
      this.isInitialized = false;
      this.eventListeners.clear();
      this.errorHandlers.clear();
      this._emit('closed', { schemaName: this.schemaName });

      return true;
    } catch (error) {
      this._handleError('CLOSE_ERROR', error as Error);
      throw error;
    }
  }

  // Status methods
  getStatus(): ServiceStatus {
    return {
      schemaName: this.schemaName,
      isOpened: this.isOpened,
      isInitialized: this.isInitialized,
      hasDao: !!this.dao,
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      await this._ensureInitialized();
      const count = await this.count();
      return {
        healthy: true,
        schemaName: this.schemaName,
        recordCount: count,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        schemaName: this.schemaName,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
