import { DatabaseManager } from '../src/database/DatabaseManager';
import { ServiceManager } from '../src/database/ServiceManager';
import { BaseService } from '../src/database/BaseService';

// Mock react-native-sqlite-storage
jest.mock('react-native-sqlite-storage', () => ({
  openDatabase: jest.fn(),
  deleteDatabase: jest.fn(),
  enablePromise: jest.fn(),
}));

// Custom User Service for testing
class UserService extends BaseService {
  constructor() {
    super('core', 'users');
  }

  async findByUsername(username) {
    const result = await this.findAll({ username });
    return result.length > 0 ? result[0] : null;
  }

  async createUser(userData) {
    this._validateData(userData);
    return await this.create(userData);
  }

  async updateUser(id, userData) {
    this._validateData(userData);
    return await this.update(id, userData);
  }

  _validateData(data) {
    if (!data.username) throw new Error('username is required');
    if (!data.email) throw new Error('email is required');
  }
}

describe('React Native SQLite DAO Service - Integration Tests', () => {
  let serviceManager;
  let databaseManager;
  let mockDb;

  beforeAll(async () => {
    // Mock database instance
    mockDb = {
      transaction: jest.fn((callback) => {
        const mockTx = {
          executeSql: jest.fn((sql, params, success, error) => {
            // Mock successful responses based on SQL type
            if (sql.includes('CREATE TABLE')) {
              success(mockTx, { rows: { length: 0, raw: () => [] } });
            } else if (sql.includes('INSERT')) {
              success(mockTx, { insertId: Date.now(), rowsAffected: 1 });
            } else if (sql.includes('UPDATE')) {
              success(mockTx, { rowsAffected: 1 });
            } else if (sql.includes('DELETE')) {
              success(mockTx, { rowsAffected: 1 });
            } else if (sql.includes('SELECT')) {
              const mockData = [
                { id: 1, username: 'admin', email: 'admin@test.com', created_at: new Date().toISOString() },
                { id: 2, username: 'staff', email: 'staff@test.com', created_at: new Date().toISOString() }
              ];
              success(mockTx, { rows: { length: mockData.length, raw: () => mockData } });
            }
          })
        };
        callback(mockTx);
      }),
      close: jest.fn(),
      executeSql: jest.fn()
    };

    // Mock SQLite opening
    require('react-native-sqlite-storage').openDatabase.mockReturnValue(mockDb);
    
    // Initialize managers
    serviceManager = ServiceManager.getInstance();
    databaseManager = DatabaseManager;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Schema và Database Initialization', () => {
    it('should register schemas successfully', async () => {
      const schemaConfig = [
        {
          schemaName: 'core',
          defaultPrimaryKeyFields: ['id'],
          defaultServiceClass: BaseService,
          defaultAutoInit: true,
          tables: [
            { 
              tableName: 'users',
              fields: {
                id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
                username: 'TEXT UNIQUE NOT NULL',
                email: 'TEXT UNIQUE NOT NULL',
                password_hash: 'TEXT',
                created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
                updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
              }
            },
            { 
              tableName: 'stores',
              fields: {
                id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
                name: 'TEXT NOT NULL',
                address: 'TEXT',
                created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
              }
            }
          ]
        },
        {
          schemaName: 'analytics',
          defaultPrimaryKeyFields: ['id'],
          defaultServiceClass: BaseService,
          defaultAutoInit: true,
          tables: [
            { 
              tableName: 'user_actions',
              fields: {
                id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
                user_id: 'INTEGER',
                action: 'TEXT NOT NULL',
                timestamp: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
              }
            }
          ]
        }
      ];

      expect(() => {
        serviceManager.registerSchemas(schemaConfig);
      }).not.toThrow();

      const registeredSchemas = serviceManager.getRegisteredSchemas();
      expect(registeredSchemas).toHaveLength(2);
      expect(registeredSchemas[0].schemaName).toBe('core');
      expect(registeredSchemas[1].schemaName).toBe('analytics');
    });

    it('should register user roles successfully', async () => {
      const roleConfig = [
        {
          roleName: 'admin',
          requiredDatabases: ['core', 'analytics'],
          optionalDatabases: ['reports'],
          priority: 1
        },
        {
          roleName: 'staff',
          requiredDatabases: ['core'],
          optionalDatabases: [],
          priority: 2
        },
        {
          roleName: 'viewer',
          requiredDatabases: ['core'],
          optionalDatabases: ['analytics'],
          priority: 3
        }
      ];

      expect(() => {
        databaseManager.registerRoles(roleConfig);
      }).not.toThrow();

      const registeredRoles = databaseManager.getRegisteredRoles();
      expect(registeredRoles).toHaveLength(3);
      expect(registeredRoles[0].roleName).toBe('admin');
    });

    it('should initialize all databases and services', async () => {
      await expect(databaseManager.initializeAll()).resolves.not.toThrow();
      await expect(serviceManager.initAllServices()).resolves.not.toThrow();

      // Verify database connections were created
      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe('2. User Role Management', () => {
    it('should set current user roles', async () => {
      await expect(databaseManager.setCurrentUserRoles(['admin'])).resolves.not.toThrow();
      
      const currentRoles = databaseManager.getCurrentUserRoles();
      expect(currentRoles).toContain('admin');
    });

    it('should handle role switching', async () => {
      // Switch to staff role
      await databaseManager.setCurrentUserRoles(['staff']);
      expect(databaseManager.getCurrentUserRoles()).toContain('staff');

      // Switch back to admin
      await databaseManager.setCurrentUserRoles(['admin']);
      expect(databaseManager.getCurrentUserRoles()).toContain('admin');
    });

    it('should validate role permissions', async () => {
      await databaseManager.setCurrentUserRoles(['staff']);
      
      // Staff should have access to core
      const coreService = await serviceManager.getService('core', 'users');
      expect(coreService).toBeDefined();

      // Staff should not have access to analytics (if not configured)
      // This depends on implementation - adjust based on your role logic
    });
  });

  describe('3. Service Usage - CRUD Operations', () => {
    let userService;

    beforeEach(async () => {
      // Ensure admin role for full access
      await databaseManager.setCurrentUserRoles(['admin']);
      userService = await serviceManager.getService('core', 'users');
    });

    it('should create a new user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword123'
      };

      const userId = await userService.create(userData);
      expect(userId).toBeDefined();
      expect(typeof userId).toBe('number');
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should find all users', async () => {
      const users = await userService.findAll();
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
      expect(users[0]).toHaveProperty('id');
      expect(users[0]).toHaveProperty('username');
      expect(users[0]).toHaveProperty('email');
    });

    it('should find user by ID', async () => {
      const user = await userService.findById(1);
      expect(user).toBeDefined();
      expect(user.id).toBe(1);
      expect(user.username).toBe('admin');
    });

    it('should update user data', async () => {
      const updateData = {
        email: 'updated@example.com',
        updated_at: new Date().toISOString()
      };

      const result = await userService.update(1, updateData);
      expect(result).toBe(1); // rows affected
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should delete user', async () => {
      const result = await userService.delete(2);
      expect(result).toBe(1); // rows affected
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should find users with conditions', async () => {
      const users = await userService.findAll({ username: 'admin' });
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
      expect(users[0].username).toBe('admin');
    });
  });

  describe('4. Custom Service Methods', () => {
    let customUserService;

    beforeEach(async () => {
      customUserService = new UserService();
      await customUserService.initialize();
    });

    it('should find user by username', async () => {
      const user = await customUserService.findByUsername('admin');
      expect(user).toBeDefined();
      expect(user.username).toBe('admin');
    });

    it('should create user with validation', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@example.com',
        password_hash: 'hash123'
      };

      const userId = await customUserService.createUser(userData);
      expect(userId).toBeDefined();
    });

    it('should validate required fields', async () => {
      const invalidData = {
        password_hash: 'hash123'
        // Missing username and email
      };

      await expect(customUserService.createUser(invalidData))
        .rejects.toThrow('username is required');
    });

    it('should update user with validation', async () => {
      const updateData = {
        username: 'updated_admin',
        email: 'updated@example.com'
      };

      const result = await customUserService.updateUser(1, updateData);
      expect(result).toBe(1);
    });
  });

  describe('5. Cross-Schema Transactions', () => {
    it('should execute transaction across multiple tables', async () => {
      const transactionCallback = jest.fn(async (services) => {
        const userService = services.get('core:users');
        const storeService = services.get('core:stores');

        expect(userService).toBeDefined();
        expect(storeService).toBeDefined();

        // Create user
        await userService.create({
          username: 'storeowner',
          email: 'owner@store.com',
          password_hash: 'hash123'
        });

        // Create store
        await storeService.create({
          name: 'Test Store',
          address: '123 Test St'
        });

        return { success: true };
      });

      await expect(
        serviceManager.executeSchemaTransaction('core', transactionCallback)
      ).resolves.not.toThrow();

      expect(transactionCallback).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const transactionCallback = jest.fn(async (services) => {
        const userService = services.get('core:users');
        
        // This should succeed
        await userService.create({
          username: 'testuser',
          email: 'test@example.com',
          password_hash: 'hash123'
        });

        // This should fail and rollback the transaction
        throw new Error('Transaction failed');
      });

      await expect(
        serviceManager.executeSchemaTransaction('core', transactionCallback)
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('6. Service Manager Status and Health', () => {
    it('should get service manager status', () => {
      const status = serviceManager.getStatus();
      expect(status).toBeDefined();
      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('activeServices');
      expect(status).toHaveProperty('registeredSchemas');
    });

    it('should perform health check', async () => {
      const health = await serviceManager.healthCheck();
      expect(health).toBeDefined();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('services');
      expect(health).toHaveProperty('databases');
    });

    it('should get service statistics', async () => {
      const stats = await serviceManager.getServiceStatistics();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalServices');
      expect(stats).toHaveProperty('activeConnections');
    });
  });

  describe('7. Database File Operations', () => {
    it('should debug database files', async () => {
      const debugInfo = await databaseManager.debugDatabaseFiles(['core', 'analytics']);
      expect(debugInfo).toBeDefined();
      expect(Array.isArray(debugInfo)).toBe(true);
    });

    it('should get database file paths', async () => {
      const paths = await databaseManager.getDatabasePaths();
      expect(paths).toBeDefined();
      expect(typeof paths).toBe('object');
    });
  });

  describe('8. Cleanup and Logout', () => {
    it('should close all services', async () => {
      await expect(serviceManager.closeAllServices()).resolves.not.toThrow();
      
      const status = serviceManager.getStatus();
      expect(status.activeServices).toBe(0);
    });

    it('should logout and clean up databases', async () => {
      await expect(databaseManager.logout()).resolves.not.toThrow();
      
      const currentRoles = databaseManager.getCurrentUserRoles();
      expect(currentRoles).toHaveLength(0);
    });

    it('should handle graceful shutdown', async () => {
      // Test app backgrounding
      await databaseManager.handleAppStateChange('background');
      
      // Test app foregrounding
      await databaseManager.handleAppStateChange('active');
      
      expect(mockDb.close).toHaveBeenCalled();
    });
  });

  describe('9. Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Mock database error
      const errorDb = {
        transaction: jest.fn((callback) => {
          const mockTx = {
            executeSql: jest.fn((sql, params, success, error) => {
              error(mockTx, new Error('Database connection failed'));
            })
          };
          callback(mockTx);
        })
      };

      require('react-native-sqlite-storage').openDatabase.mockReturnValueOnce(errorDb);

      const userService = await serviceManager.getService('core', 'users');
      await expect(userService.findAll()).rejects.toThrow('Database connection failed');
    });

    it('should handle service not found', async () => {
      await expect(serviceManager.getService('nonexistent', 'table'))
        .rejects.toThrow();
    });

    it('should handle invalid role assignment', async () => {
      await expect(databaseManager.setCurrentUserRoles(['invalid_role']))
        .rejects.toThrow();
    });
  });

  describe('10. Performance and Optimization', () => {
    it('should handle batch operations efficiently', async () => {
      const userService = await serviceManager.getService('core', 'users');
      
      const users = [
        { username: 'user1', email: 'user1@test.com', password_hash: 'hash1' },
        { username: 'user2', email: 'user2@test.com', password_hash: 'hash2' },
        { username: 'user3', email: 'user3@test.com', password_hash: 'hash3' }
      ];

      const startTime = Date.now();
      
      for (const user of users) {
        await userService.create(user);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000);
    });

    it('should cache service instances', async () => {
      const service1 = await serviceManager.getService('core', 'users');
      const service2 = await serviceManager.getService('core', 'users');
      
      // Should return same instance
      expect(service1).toBe(service2);
    });
  });
});