import { DatabaseManager } from '../src/database/DatabaseManager';
import SQLite from 'react-native-sqlite-storage';

// Mock react-native-sqlite-storage
jest.mock('react-native-sqlite-storage', () => ({
  openDatabase: jest.fn(),
  deleteDatabase: jest.fn(),
  enablePromise: jest.fn(),
  DEBUG: jest.fn(),
  LOCATION: {
    DEFAULT: 'default'
  }
}));

describe('DatabaseManager', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database instance
    mockDb = {
      transaction: jest.fn((callback) => {
        const mockTx = {
          executeSql: jest.fn((sql, params, success, error) => {
            if (success) {
              if (sql.includes('CREATE TABLE')) {
                success(mockTx, { rows: { length: 0, raw: () => [] } });
              } else if (sql.includes('INSERT')) {
                success(mockTx, { insertId: 1, rowsAffected: 1 });
              } else if (sql.includes('PRAGMA')) {
                success(mockTx, { rows: { length: 1, raw: () => [{ name: 'test_table' }] } });
              }
            }
          })
        };
        callback(mockTx);
      }),
      close: jest.fn(),
      executeSql: jest.fn()
    };

    SQLite.openDatabase.mockReturnValue(mockDb);
  });

  describe('Role Management', () => {
    it('should register roles successfully', () => {
      const roles = [
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
        }
      ];

      expect(() => {
        DatabaseManager.registerRoles(roles);
      }).not.toThrow();

      const registeredRoles = DatabaseManager.getRegisteredRoles();
      expect(registeredRoles).toHaveLength(2);
      expect(registeredRoles[0].roleName).toBe('admin');
    });

    it('should validate role configuration', () => {
      const invalidRoles = [
        {
          // Missing roleName
          requiredDatabases: ['core'],
          priority: 1
        }
      ];

      expect(() => {
        DatabaseManager.registerRoles(invalidRoles);
      }).toThrow();
    });

    it('should set current user roles', async () => {
      // First register roles
      DatabaseManager.registerRoles([
        {
          roleName: 'admin',
          requiredDatabases: ['core'],
          priority: 1
        }
      ]);

      await DatabaseManager.setCurrentUserRoles(['admin']);
      
      const currentRoles = DatabaseManager.getCurrentUserRoles();
      expect(currentRoles).toContain('admin');
    });

    it('should handle multiple roles', async () => {
      DatabaseManager.registerRoles([
        {
          roleName: 'admin',
          requiredDatabases: ['core'],
          priority: 1
        },
        {
          roleName: 'manager',
          requiredDatabases: ['core', 'reports'],
          priority: 2
        }
      ]);

      await DatabaseManager.setCurrentUserRoles(['admin', 'manager']);
      
      const currentRoles = DatabaseManager.getCurrentUserRoles();
      expect(currentRoles).toContain('admin');
      expect(currentRoles).toContain('manager');
    });
  });

  describe('Database Initialization', () => {
    beforeEach(() => {
      DatabaseManager.registerRoles([
        {
          roleName: 'admin',
          requiredDatabases: ['core', 'analytics'],
          priority: 1
        }
      ]);
    });

    it('should initialize all databases', async () => {
      await DatabaseManager.initializeAll();
      
      // Verify database connections were attempted
      expect(SQLite.openDatabase).toHaveBeenCalled();
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should create database tables', async () => {
      const schemaConfig = {
        core: {
          users: {
            id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
            username: 'TEXT UNIQUE NOT NULL',
            email: 'TEXT UNIQUE NOT NULL',
            created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
          }
        }
      };

      await DatabaseManager.createTables('core', schemaConfig.core);
      
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should handle database connection errors', async () => {
      SQLite.openDatabase.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(DatabaseManager.initializeAll()).rejects.toThrow();
    });
  });

  describe('Database Operations', () => {
    beforeEach(async () => {
      DatabaseManager.registerRoles([
        {
          roleName: 'admin',
          requiredDatabases: ['core'],
          priority: 1
        }
      ]);
      
      await DatabaseManager.initializeAll();
      await DatabaseManager.setCurrentUserRoles(['admin']);
    });

    it('should get database instance', () => {
      const db = DatabaseManager.getDatabase('core');
      expect(db).toBeDefined();
      expect(db).toBe(mockDb);
    });

    it('should handle non-existent database', () => {
      expect(() => {
        DatabaseManager.getDatabase('nonexistent');
      }).toThrow();
    });

    it('should check database existence', () => {
      expect(DatabaseManager.isDatabaseOpen('core')).toBe(true);
      expect(DatabaseManager.isDatabaseOpen('nonexistent')).toBe(false);
    });

    it('should get all open databases', () => {
      const openDbs = DatabaseManager.getOpenDatabases();
      expect(openDbs).toContain('core');
    });
  });

  describe('Database File Management', () => {
    it('should get database file paths', async () => {
      const paths = await DatabaseManager.getDatabasePaths();
      expect(paths).toBeDefined();
      expect(typeof paths).toBe('object');
    });

    it('should debug database files', async () => {
      const debugInfo = await DatabaseManager.debugDatabaseFiles(['core']);
      expect(debugInfo).toBeDefined();
      expect(Array.isArray(debugInfo)).toBe(true);
    });

    it('should get database size', async () => {
      const size = await DatabaseManager.getDatabaseSize('core');
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AppState Management', () => {
    beforeEach(async () => {
      DatabaseManager.registerRoles([
        {
          roleName: 'admin',
          requiredDatabases: ['core'],
          priority: 1
        }
      ]);
      
      await DatabaseManager.initializeAll();
    });

    it('should handle app going to background', async () => {
      await DatabaseManager.handleAppStateChange('background');
      
      // Verify databases were closed
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should handle app coming to foreground', async () => {
      // First go to background
      await DatabaseManager.handleAppStateChange('background');
      
      // Then come back to foreground
      await DatabaseManager.handleAppStateChange('active');
      
      // Verify databases were reopened
      expect(SQLite.openDatabase).toHaveBeenCalled();
    });

    it('should handle app state change errors', async () => {
      mockDb.close.mockImplementation(() => {
        throw new Error('Close failed');
      });

      // Should not throw error, just log it
      await expect(DatabaseManager.handleAppStateChange('background')).resolves.not.toThrow();
    });
  });

  describe('Transaction Management', () => {
    beforeEach(async () => {
      DatabaseManager.registerRoles([
        {
          roleName: 'admin',
          requiredDatabases: ['core'],
          priority: 1
        }
      ]);
      
      await DatabaseManager.initializeAll();
      await DatabaseManager.setCurrentUserRoles(['admin']);
    });

    it('should execute database transaction', async () => {
      const transactionCallback = jest.fn((tx) => {
        tx.executeSql('INSERT INTO users (username, email) VALUES (?, ?)', ['test', 'test@example.com']);
      });

      await DatabaseManager.executeTransaction('core', transactionCallback);
      
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(transactionCallback).toHaveBeenCalled();
    });

    it('should handle transaction errors', async () => {
      mockDb.transaction.mockImplementation((callback) => {
        const mockTx = {
          executeSql: jest.fn((sql, params, success, error) => {
            if (error) error(mockTx, new Error('Transaction failed'));
          })
        };
        callback(mockTx);
      });

      const transactionCallback = jest.fn((tx) => {
        tx.executeSql('INVALID SQL');
      });

      await expect(DatabaseManager.executeTransaction('core', transactionCallback))
        .rejects.toThrow('Transaction failed');
    });
  });

  describe('Database Backup and Restore', () => {
    it('should backup database', async () => {
      const backupPath = await DatabaseManager.backupDatabase('core');
      expect(backupPath).toBeDefined();
      expect(typeof backupPath).toBe('string');
    });

    it('should restore database', async () => {
      const backupPath = '/path/to/backup.db';
      await expect(DatabaseManager.restoreDatabase('core', backupPath)).resolves.not.toThrow();
    });

    it('should handle backup errors', async () => {
      // Mock file system error
      await expect(DatabaseManager.backupDatabase('nonexistent')).rejects.toThrow();
    });
  });

  describe('Database Optimization', () => {
    beforeEach(async () => {
      DatabaseManager.registerRoles([
        {
          roleName: 'admin',
          requiredDatabases: ['core'],
          priority: 1
        }
      ]);
      
      await DatabaseManager.initializeAll();
    });

    it('should vacuum database', async () => {
      await DatabaseManager.vacuumDatabase('core');
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should analyze database', async () => {
      await DatabaseManager.analyzeDatabase('core');
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should get database statistics', async () => {
      const stats = await DatabaseManager.getDatabaseStatistics('core');
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });
  });

  describe('Cleanup and Logout', () => {
    beforeEach(async () => {
      DatabaseManager.registerRoles([
        {
          roleName: 'admin',
          requiredDatabases: ['core'],
          priority: 1
        }
      ]);
      
      await DatabaseManager.initializeAll();
      await DatabaseManager.setCurrentUserRoles(['admin']);
    });

    it('should close all databases', async () => {
      await DatabaseManager.closeAllDatabases();
      
      expect(mockDb.close).toHaveBeenCalled();
      expect(DatabaseManager.getOpenDatabases()).toHaveLength(0);
    });

    it('should logout user', async () => {
      await DatabaseManager.logout();
      
      expect(mockDb.close).toHaveBeenCalled();
      expect(DatabaseManager.getCurrentUserRoles()).toHaveLength(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      mockDb.close.mockImplementation(() => {
        throw new Error('Close failed');
      });

      // Should not throw error
      await expect(DatabaseManager.closeAllDatabases()).resolves.not.toThrow();
    });
  });

  describe('Connection Pooling', () => {
    it('should manage connection pool', async () => {
      const poolSize = DatabaseManager.getConnectionPoolSize();
      expect(typeof poolSize).toBe('number');
      expect(poolSize).toBeGreaterThan(0);
    });

    it('should handle connection pool limits', async () => {
      // This test depends on your implementation
      // Test that connection pool doesn't exceed limits
      const maxConnections = 10;
      const connections = [];
      
      for (let i = 0; i < maxConnections + 5; i++) {
        try {
          const db = DatabaseManager.getDatabase('core');
          connections.push(db);
        } catch (error) {
          // Expected when pool is exhausted
          expect(error.message).toContain('pool');
          break;
        }
      }
      
      expect(connections.length).toBeLessThanOrEqual(maxConnections);
    });

    it('should reuse connections efficiently', async () => {
      const db1 = DatabaseManager.getDatabase('core');
      const db2 = DatabaseManager.getDatabase('core');
      
      // Should return same instance for same database
      expect(db1).toBe(db2);
    });
  });

  describe('Database Migration', () => {
    it('should handle database version upgrades', async () => {
      const migrationCallback = jest.fn((db, oldVersion, newVersion) => {
        expect(oldVersion).toBeLessThan(newVersion);
        return true;
      });

      await DatabaseManager.migrateDatabase('core', 2, migrationCallback);
      expect(migrationCallback).toHaveBeenCalled();
    });

    it('should handle migration errors', async () => {
      const migrationCallback = jest.fn(() => {
        throw new Error('Migration failed');
      });

      await expect(DatabaseManager.migrateDatabase('core', 2, migrationCallback))
        .rejects.toThrow('Migration failed');
    });
  });

  describe('Database Monitoring', () => {
    it('should monitor database performance', async () => {
      const metrics = await DatabaseManager.getPerformanceMetrics('core');
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
      expect(metrics).toHaveProperty('queryCount');
      expect(metrics).toHaveProperty('averageQueryTime');
    });

    it('should track database operations', async () => {
      const operations = await DatabaseManager.getOperationHistory('core');
      expect(Array.isArray(operations)).toBe(true);
    });

    it('should handle monitoring errors', async () => {
      await expect(DatabaseManager.getPerformanceMetrics('nonexistent'))
        .rejects.toThrow();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from database corruption', async () => {
      // Mock corrupted database
      mockDb.transaction.mockImplementation(() => {
        throw new Error('database is locked');
      });

      await expect(DatabaseManager.recoverDatabase('core')).resolves.not.toThrow();
    });

    it('should handle recovery failures', async () => {
      // Mock unrecoverable database
      mockDb.transaction.mockImplementation(() => {
        throw new Error('disk I/O error');
      });

      await expect(DatabaseManager.recoverDatabase('core')).rejects.toThrow();
    });
  });

  describe('Database Security', () => {
    it('should validate database access permissions', async () => {
      await DatabaseManager.setCurrentUserRoles(['admin']);
      
      const hasAccess = DatabaseManager.hasAccess('core', 'admin');
      expect(hasAccess).toBe(true);
    });

    it('should deny unauthorized access', async () => {
      await DatabaseManager.setCurrentUserRoles(['guest']);
      
      const hasAccess = DatabaseManager.hasAccess('analytics', 'guest');
      expect(hasAccess).toBe(false);
    });

    it('should audit database operations', async () => {
      const auditLog = await DatabaseManager.getAuditLog('core');
      expect(Array.isArray(auditLog)).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should manage memory usage', async () => {
      const memoryUsage = await DatabaseManager.getMemoryUsage();
      expect(typeof memoryUsage).toBe('object');
      expect(memoryUsage).toHaveProperty('total');
      expect(memoryUsage).toHaveProperty('used');
    });

    it('should clear memory caches', async () => {
      await expect(DatabaseManager.clearCaches()).resolves.not.toThrow();
    });

    it('should handle memory pressure', async () => {
      await expect(DatabaseManager.handleMemoryPressure()).resolves.not.toThrow();
    });
  });

  describe('Database Synchronization', () => {
    it('should handle concurrent access', async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(DatabaseManager.executeTransaction('core', (tx) => {
          tx.executeSql('INSERT INTO users (username) VALUES (?)', [`user${i}`]);
        }));
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should prevent deadlocks', async () => {
      // Mock potential deadlock scenario
      const promise1 = DatabaseManager.executeTransaction('core', (tx) => {
        tx.executeSql('UPDATE users SET username = ? WHERE id = ?', ['user1', 1]);
      });

      const promise2 = DatabaseManager.executeTransaction('core', (tx) => {
        tx.executeSql('UPDATE users SET username = ? WHERE id = ?', ['user2', 2]);
      });

      await expect(Promise.all([promise1, promise2])).resolves.not.toThrow();
    });
  });

  describe('Database Configuration', () => {
    it('should configure database settings', async () => {
      const config = {
        cacheSize: 2000,
        pageSize: 4096,
        synchronous: 'NORMAL'
      };

      await DatabaseManager.configureDatabase('core', config);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should validate configuration', () => {
      const invalidConfig = {
        cacheSize: -1000, // Invalid value
        pageSize: 'invalid'
      };

      expect(() => {
        DatabaseManager.validateConfiguration(invalidConfig);
      }).toThrow();
    });
  });

  describe('Database Utilities', () => {
    it('should check database integrity', async () => {
      const integrity = await DatabaseManager.checkIntegrity('core');
      expect(typeof integrity).toBe('object');
      expect(integrity).toHaveProperty('isValid');
    });

    it('should repair database if needed', async () => {
      await expect(DatabaseManager.repairDatabase('core')).resolves.not.toThrow();
    });

    it('should export database schema', async () => {
      const schema = await DatabaseManager.exportSchema('core');
      expect(typeof schema).toBe('string');
      expect(schema.length).toBeGreaterThan(0);
    });

    it('should import database schema', async () => {
      const schemaSQL = `
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL
        );
      `;

      await expect(DatabaseManager.importSchema('core', schemaSQL)).resolves.not.toThrow();
    });
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await DatabaseManager.closeAllDatabases();
      await DatabaseManager.logout();
    } catch (error) {
      // Ignore cleanup errors
    }
  });
});