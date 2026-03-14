import Database from 'better-sqlite3';

let db: Database.Database;

export function setDatabase(database: Database.Database): void {
  db = database;
}

export function getDatabase(): Database.Database {
  return db;
}

export function beginTransaction(): void {
  db.exec('BEGIN TRANSACTION');
}

export function commit(): void {
  db.exec('COMMIT');
}

export function rollback(): void {
  db.exec('ROLLBACK');
}

export function transaction<T>(fn: () => T): T {
  beginTransaction();
  try {
    const result = fn();
    commit();
    return result;
  } catch (error) {
    rollback();
    throw error;
  }
}
