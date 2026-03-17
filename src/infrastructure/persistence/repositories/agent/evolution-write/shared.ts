import { getDatabase as getPersistenceDatabase } from '../../../sqlite/transaction-manager.js';

export function getDb(): any {
  return getPersistenceDatabase();
}
