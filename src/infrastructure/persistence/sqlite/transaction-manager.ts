import type Database from 'better-sqlite3';

let db: Database.Database;

function assertDatabaseInitialized(): Database.Database {
  if (!db) {
    throw new Error(
      'Database handle is not initialized. Call setDatabase() before using persistence operations.',
    );
  }
  return db;
}

export function setDatabase(database: Database.Database): void {
  db = database;
}

export function getDatabase(): Database.Database {
  return assertDatabaseInitialized();
}

export function beginTransaction(): void {
  assertDatabaseInitialized().exec('BEGIN TRANSACTION');
}

export function commit(): void {
  assertDatabaseInitialized().exec('COMMIT');
}

export function rollback(): void {
  assertDatabaseInitialized().exec('ROLLBACK');
}

export function transaction<T>(fn: () => T): T {
  beginTransaction();
  try {
    const result = fn();
    commit();
    return result;
  } catch (error) {
    try {
      rollback();
    } catch {
      throw error;
    }
    throw error;
  }
}
