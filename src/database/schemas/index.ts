import { DatabaseSchemaWithTypeMapping } from '../SQLiteDAO';

import * as core from './core.json';

// Ép kiểu rõ ràng tại thời điểm export
export const schemaConfigurations: Record<string, DatabaseSchemaWithTypeMapping> = {
  core,
};

