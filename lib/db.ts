/**
 * 数据库访问层：node:sqlite（零外部服务，本地文件 .data/claims.db）。
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqlValue = string | number | null;
export type Row = Record<string, unknown>;
export type Statement = { sql: string; args?: SqlValue[] };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    token_count INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chunk_terms (
    chunk_id TEXT NOT NULL,
    term TEXT NOT NULL,
    freq INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS guides (
    id TEXT PRIMARY KEY,
    claim_type TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    steps TEXT NOT NULL,
    materials TEXT NOT NULL,
    tips TEXT NOT NULL,
    ordinal INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chunk_terms_term ON chunk_terms(term)`,
];

let dbPromise: Promise<DatabaseSync> | null = null;

async function getDb(): Promise<DatabaseSync> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const directory =
        process.env.CLAIMS_DB_DIR?.trim() || path.join(process.cwd(), ".data");
      mkdirSync(directory, { recursive: true });

      const database = new DatabaseSync(path.join(directory, "claims.db"));
      database.exec("PRAGMA journal_mode = WAL;");
      for (const sql of SCHEMA) database.exec(sql);
      return database;
    })();
  }
  return dbPromise;
}

export async function dbAll(
  sql: string,
  args: SqlValue[] = [],
): Promise<Row[]> {
  const database = await getDb();
  return database.prepare(sql).all(...args) as unknown as Row[];
}

export async function dbRun(
  sql: string,
  args: SqlValue[] = [],
): Promise<{ lastInsertRowid: number }> {
  const database = await getDb();
  const result = database.prepare(sql).run(...args);
  return { lastInsertRowid: Number(result.lastInsertRowid) };
}

export async function dbBatch(statements: Statement[]): Promise<void> {
  if (statements.length === 0) return;
  const database = await getDb();
  database.exec("BEGIN");
  try {
    for (const statement of statements) {
      database.prepare(statement.sql).run(...(statement.args ?? []));
    }
    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // 回滚失败时保留原始错误
    }
    throw error;
  }
}
