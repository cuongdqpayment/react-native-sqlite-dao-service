@echo off
echo ===============================================
echo Fixing Jest configuration and installing missing packages
echo ===============================================

REM Navigate to project directory
cd /d "C:\Users\cuong\DEV\MOBILE-APP\react-native-sqlite-dao-service"

REM Install missing Jest packages
echo Installing Jest-related packages...
npm install --save-dev ts-jest @types/jest jest-environment-node

REM Create corrected jest.config.js
echo Creating corrected jest.config.js...
(
echo module.exports = {
echo   preset: 'react-native',
echo   moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
echo   transform: {
echo     '^.+\\.\^(ts^|tsx\^)$': 'ts-jest',
echo   },
echo   testMatch: [
echo     '**/__tests__/**/*.\^(ts^|tsx^|js^|jsx\^)',
echo     '**/*.\^(test^|spec\^).\^(ts^|tsx^|js^|jsx\^)'
echo   ],
echo   collectCoverageFrom: [
echo     'src/**/*.{ts,tsx}',
echo     '!src/**/*.d.ts',
echo     '!src/index.ts',
echo   ],
echo   moduleNameMapper: {
echo     '^@/\^(.*\^)$': '^<rootDir^>/src/$1',
echo   },
echo   testEnvironment: 'node',
echo   setupFilesAfterEnv: ['./jest.setup.js'],
echo   transformIgnorePatterns: [
echo     'node_modules/\^(?!\^(react-native^|@react-native^|react-native-sqlite-storage\^)\^)'
echo   ],
echo };
) > jest.config.js

REM Create jest.setup.js
echo Creating jest.setup.js...
(
echo // Mock react-native-sqlite-storage
echo jest.mock\^('react-native-sqlite-storage', \^(\^) =^> \^({
echo   openDatabase: jest.fn\^(\^).mockResolvedValue\^({
echo     transaction: jest.fn\^(\^),
echo     executeSql: jest.fn\^(\^),
echo     close: jest.fn\^(\^),
echo   }\^),
echo   SQLiteDatabase: jest.fn\^(\^),
echo }\^)\^);
echo.
echo // Mock react-native modules
echo jest.mock\^('react-native', \^(\^) =^> \^({
echo   Platform: {
echo     OS: 'ios',
echo   },
echo }\^)\^);
) > jest.setup.js

REM Create a simple test file
echo Creating sample test file...
mkdir __tests__ 2>nul
(
echo import { Connection } from '../src/database/Connection';
echo.
echo describe\^('Connection', \^(\^) =^> {
echo   it\^('should create a connection instance', \^(\^) =^> {
echo     const config = {
echo       name: 'test.db',
echo       version: '1.0',
echo     };
echo     
echo     const connection = Connection.getInstance\^(config\^);
echo     expect\^(connection\^).toBeDefined\^(\^);
echo   }\^);
echo.
echo   it\^('should return the same instance for the same config', \^(\^) =^> {
echo     const config = {
echo       name: 'test.db',
echo       version: '1.0',
echo     };
echo     
echo     const connection1 = Connection.getInstance\^(config\^);
echo     const connection2 = Connection.getInstance\^(config\^);
echo     
echo     expect\^(connection1\^).toBe\^(connection2\^);
echo   }\^);
echo }\^);
) > __tests__\Connection.test.ts

REM Update package.json with correct dependencies
echo Updating package.json with correct test dependencies...
(
echo {
echo   "name": "react-native-sqlite-dao-service",
echo   "version": "1.0.0",
echo   "description": "Một thư viện mạnh mẽ dành cho React Native, giúp lập trình viên dễ dàng khai báo, quản lý và vận hành các cơ sở dữ liệu SQLite dưới dạng nhiều schema và service rõ ràng, tường minh, mở rộng được. Phù hợp cho các ứng dụng di động độc lập, offline-first, đa vai trò người dùng và đa bảng nghiệp vụ.",
echo   "main": "lib/index.js",
echo   "module": "lib/index.js",
echo   "types": "lib/index.d.ts",
echo   "react-native": "src/index.ts",
echo   "source": "src/index.ts",
echo   "files": [
echo     "src",
echo     "lib",
echo     "!**/__tests__",
echo     "!**/__fixtures__",
echo     "!**/__mocks__",
echo     "!**/.*"
echo   ],
echo   "scripts": {
echo     "build": "tsc",
echo     "dev": "tsc --watch",
echo     "prepare": "npm run build",
echo     "test": "jest",
echo     "test:watch": "jest --watch",
echo     "test:coverage": "jest --coverage",
echo     "lint": "eslint \"src/**/*.{js,ts,tsx}\"",
echo     "lint:fix": "eslint \"src/**/*.{js,ts,tsx}\" --fix",
echo     "typecheck": "tsc --noEmit",
echo     "example": "cd example && npm start"
echo   },
echo   "keywords": [
echo     "react-native",
echo     "sqlite",
echo     "database",
echo     "dao",
echo     "service",
echo     "orm",
echo     "offline",
echo     "schema",
echo     "mobile"
echo   ],
echo   "author": {
echo     "name": "Doan Quoc Cuong",
echo     "email": "cuongdq3500888@gmail.com",
echo     "url": "https://www.npmjs.com/settings/cuongdq/packages"
echo   },
echo   "license": "MIT",
echo   "repository": {
echo     "type": "git",
echo     "url": "https://github.com/cuongdqpayment/react-native-sqlite-dao-service.git"
echo   },
echo   "bugs": {
echo     "url": "https://github.com/cuongdqpayment/react-native-sqlite-dao-service/issues"
echo   },
echo   "homepage": "https://github.com/cuongdqpayment/react-native-sqlite-dao-service#readme",
echo   "publishConfig": {
echo     "registry": "https://registry.npmjs.org/"
echo   },
echo   "devDependencies": {
echo     "@react-native-community/eslint-config": "^3.2.0",
echo     "@types/jest": "^29.5.0",
echo     "@types/react": "^18.0.0",
echo     "@types/react-native": "^0.72.0",
echo     "@typescript-eslint/eslint-plugin": "^6.0.0",
echo     "@typescript-eslint/parser": "^6.0.0",
echo     "eslint": "^8.0.0",
echo     "eslint-config-prettier": "^9.0.0",
echo     "eslint-plugin-prettier": "^5.0.0",
echo     "jest": "^29.5.0",
echo     "jest-environment-node": "^29.5.0",
echo     "prettier": "^3.0.0",
echo     "react": "^18.0.0",
echo     "react-native": "^0.72.0",
echo     "ts-jest": "^29.1.0",
echo     "typescript": "^5.0.0"
echo   },
echo   "dependencies": {
echo     "react-native-sqlite-storage": "^6.0.1"
echo   },
echo   "peerDependencies": {
echo     "react": "^=16.8.0",
echo     "react-native": "^=0.60.0",
echo     "react-native-sqlite-storage": "^=6.0.0"
echo   }
echo }
) > package.json

REM Create TypeScript configuration for Jest
echo Creating TypeScript configuration for Jest...
(
echo {
echo   "extends": "./tsconfig.json",
echo   "compilerOptions": {
echo     "types": ["jest", "node"],
echo     "esModuleInterop": true,
echo     "allowSyntheticDefaultImports": true
echo   },
echo   "include": [
echo     "src/**/*",
echo     "__tests__/**/*"
echo   ]
echo }
) > tsconfig.test.json

REM Update .eslintrc.js for better React Native support
echo Updating .eslintrc.js...
(
echo module.exports = {
echo   root: true,
echo   extends: [
echo     '@react-native-community',
echo     'prettier',
echo   ],
echo   parser: '@typescript-eslint/parser',
echo   plugins: ['@typescript-eslint'],
echo   parserOptions: {
echo     ecmaVersion: 2020,
echo     sourceType: 'module',
echo     ecmaFeatures: {
echo       jsx: true,
echo     },
echo   },
echo   env: {
echo     jest: true,
echo     node: true,
echo   },
echo   overrides: [
echo     {
echo       files: ['*.ts', '*.tsx'],
echo       rules: {
echo         '@typescript-eslint/no-shadow': ['error'],
echo         'no-shadow': 'off',
echo         'no-undef': 'off',
echo         '@typescript-eslint/no-unused-vars': ['error'],
echo         'no-unused-vars': 'off',
echo       },
echo     },
echo   ],
echo   ignorePatterns: ['lib/', 'node_modules/', 'example/'],
echo };
) > .eslintrc.js

echo.
echo ===============================================
echo Configuration fixed! Installing dependencies...
echo ===============================================

REM Install all dependencies
npm install

echo.
echo ===============================================
echo Running tests...
echo ===============================================

REM Run tests
npm test

echo.
echo ===============================================
echo Setup completed successfully!
echo ===============================================
echo.
echo You can now run:
echo - npm test        ^(run tests^)
echo - npm run build   ^(build the library^)
echo - npm run lint    ^(lint the code^)
echo - npm run dev     ^(watch mode for development^)
echo.
pause