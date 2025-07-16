"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseService = void 0;
const DatabaseManager_1 = require("./DatabaseManager");
class BaseService {
    constructor(schemaName, tableName) {
        this.dao = null;
        this.isOpened = false;
        this.isInitialized = false;
        this.errorHandlers = new Map();
        this.eventListeners = new Map();
        this.primaryKeyFields = ['id'];
        // nếu muốn catch thứ gì để lần sau khỏi select trong db thì lấy từ đây
        this.cache = new Map();
        this.schemaName = schemaName;
        this.tableName = tableName || schemaName;
        // Bind methods to preserve context
        this.bindMethods();
    }
    bindMethods() {
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this));
        methods.forEach((method) => {
            if (typeof this[method] === 'function' && method !== 'constructor') {
                this[method] = this[method].bind(this);
            }
        });
    }
    // Set custom primary key fields (default is ['id'])
    setPrimaryKeyFields(fields) {
        this.primaryKeyFields = fields;
        return this;
    }
    // Initialize service and get DAO
    async init() {
        try {
            if (this.isInitialized) {
                return this;
            }
            // sử dụng mở cơ sở dữ liệu nếu chưa mở kết nối
            // tức là mở đơn lẻ khi muốn dùng tránh mở nhiều csdl mà không dùng đến
            this.dao = (await DatabaseManager_1.DatabaseManager.getLazyLoading(this.schemaName));
            if (!this.dao) {
                throw new Error(`Failed to initialize DAO for schema: ${this.schemaName}`);
            }
            this.isOpened = true;
            this.isInitialized = true;
            this._emit('initialized', { schemaName: this.schemaName });
            return this;
        }
        catch (error) {
            this._handleError('INIT_ERROR', error);
            throw error;
        }
    }
    // Helper method to build QueryTable for select operations
    buildSelectTable(conditions = {}, options = {}) {
        const queryTable = {
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
            queryTable.limitOffset.limit = options.limit;
        }
        if (options.offset !== undefined) {
            queryTable.limitOffset.offset = options.offset;
        }
        return queryTable;
    }
    // Helper method to build QueryTable for insert/update operations
    buildDataTable(data) {
        return this.dao.convertJsonToQueryTable(this.tableName, data, this.primaryKeyFields);
    }
    // Generic CRUD operations
    async findAll(conditions = {}, options = {}) {
        await this._ensureInitialized();
        try {
            const queryTable = this.buildSelectTable(conditions, options);
            const result = await this.dao.selectAll(queryTable);
            this._emit('dataFetched', { operation: 'findAll', count: result.length });
            return result;
        }
        catch (error) {
            this._handleError('FIND_ALL_ERROR', error);
            throw error;
        }
    }
    async findById(id) {
        await this._ensureInitialized();
        try {
            if (!id) {
                throw new Error('ID is required');
            }
            const conditions = { [this.primaryKeyFields[0]]: id };
            const queryTable = this.buildSelectTable(conditions);
            const result = await this.dao.select(queryTable);
            this._emit('dataFetched', { operation: 'findById', id });
            return result;
        }
        catch (error) {
            this._handleError('FIND_BY_ID_ERROR', error);
            throw error;
        }
    }
    async findFirst(conditions = {}) {
        await this._ensureInitialized();
        try {
            const queryTable = this.buildSelectTable(conditions);
            const result = await this.dao.select(queryTable);
            this._emit('dataFetched', { operation: 'findFirst' });
            return result;
        }
        catch (error) {
            this._handleError('FIND_FIRST_ERROR', error);
            throw error;
        }
    }
    async create(data) {
        await this._ensureInitialized();
        try {
            this._validateData(data);
            const queryTable = this.buildDataTable(data);
            await this.dao.insert(queryTable);
            // Get the created record if it has an ID
            let result = data;
            if (data[this.primaryKeyFields[0]]) {
                result = await this.findById(data[this.primaryKeyFields[0]]);
            }
            this._emit('dataCreated', { operation: 'create', data: result });
            return result;
        }
        catch (error) {
            this._handleError('CREATE_ERROR', error);
            throw error;
        }
    }
    async update(id, data) {
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
            await this.dao.update(queryTable);
            // Get the updated record
            const result = await this.findById(id);
            this._emit('dataUpdated', { operation: 'update', id, data: result });
            return result;
        }
        catch (error) {
            this._handleError('UPDATE_ERROR', error);
            throw error;
        }
    }
    async delete(id) {
        await this._ensureInitialized();
        try {
            if (!id) {
                throw new Error('ID is required for delete');
            }
            const conditions = { [this.primaryKeyFields[0]]: id };
            const queryTable = this.buildSelectTable(conditions);
            await this.dao.delete(queryTable);
            this._emit('dataDeleted', { operation: 'delete', id });
            return true;
        }
        catch (error) {
            this._handleError('DELETE_ERROR', error);
            throw error;
        }
    }
    async bulkCreate(dataArray) {
        await this._ensureInitialized();
        try {
            if (!Array.isArray(dataArray) || dataArray.length === 0) {
                throw new Error('Data must be a non-empty array');
            }
            const results = [];
            // Use transaction for bulk operations
            await this.executeTransaction(async () => {
                for (const data of dataArray) {
                    this._validateData(data);
                    const queryTable = this.buildDataTable(data);
                    await this.dao.insert(queryTable);
                    results.push(data);
                }
            });
            this._emit('dataBulkCreated', {
                operation: 'bulkCreate',
                count: results.length,
            });
            return results;
        }
        catch (error) {
            this._handleError('BULK_CREATE_ERROR', error);
            throw error;
        }
    }
    async count(conditions = {}) {
        await this._ensureInitialized();
        try {
            const queryTable = this.buildSelectTable(conditions, {
                columns: ['COUNT(*) as count'],
            });
            const result = await this.dao.select(queryTable);
            return result.count || 0;
        }
        catch (error) {
            this._handleError('COUNT_ERROR', error);
            throw error;
        }
    }
    // Transaction support
    async executeTransaction(callback) {
        await this._ensureInitialized();
        try {
            await this.dao.beginTransaction();
            const result = await callback();
            await this.dao.commitTransaction();
            this._emit('transactionCompleted', { operation: 'transaction' });
            return result;
        }
        catch (error) {
            try {
                await this.dao.rollbackTransaction();
            }
            catch (rollbackError) {
                this._handleError('ROLLBACK_ERROR', rollbackError);
            }
            this._handleError('TRANSACTION_ERROR', error);
            throw error;
        }
    }
    // Legacy method aliases for backward compatibility
    async getAll(conditions = {}, options = {}) {
        return this.findAll(conditions, options);
    }
    async getById(id) {
        return this.findById(id);
    }
    async getFirst(conditions = {}) {
        return this.findFirst(conditions);
    }
    // Event handling
    on(event, handler) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(handler);
        return this;
    }
    off(event, handler) {
        const handlers = this.eventListeners.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
        return this;
    }
    _emit(event, data) {
        const handlers = this.eventListeners.get(event);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(data);
                }
                catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }
    // Error handling
    setErrorHandler(errorType, handler) {
        this.errorHandlers.set(errorType, handler);
        return this;
    }
    _handleError(errorType, error) {
        const handler = this.errorHandlers.get(errorType);
        if (handler) {
            try {
                handler(error);
            }
            catch (handlerError) {
                console.error(`Error in error handler for ${errorType}:`, handlerError);
            }
        }
        // Default error logging
        console.error(`${this.schemaName} Service Error [${errorType}]:`, error);
        this._emit('error', { errorType, error });
    }
    // Validation (override in subclasses)
    _validateData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Data must be a valid object');
        }
    }
    // Utility methods
    async _ensureInitialized() {
        if (!this.isInitialized) {
            await this.init();
        }
    }
    // Get database info
    async getDatabaseInfo() {
        await this._ensureInitialized();
        return this.dao.getDatabaseInfo();
    }
    // Get table info
    async getTableInfo() {
        await this._ensureInitialized();
        return this.dao.getTableInfo(this.tableName);
    }
    // Cleanup and resource management
    async close() {
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
        }
        catch (error) {
            this._handleError('CLOSE_ERROR', error);
            throw error;
        }
    }
    // Status methods
    getStatus() {
        return {
            schemaName: this.schemaName,
            isOpened: this.isOpened,
            isInitialized: this.isInitialized,
            hasDao: !!this.dao,
        };
    }
    async healthCheck() {
        try {
            await this._ensureInitialized();
            const count = await this.count();
            return {
                healthy: true,
                schemaName: this.schemaName,
                recordCount: count,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            return {
                healthy: false,
                schemaName: this.schemaName,
                error: error.message,
                timestamp: new Date().toISOString(),
            };
        }
    }
}
exports.BaseService = BaseService;
