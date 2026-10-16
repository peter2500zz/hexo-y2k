// Node 内置的 node:sqlite 适配器和迁移执行器（迁移记录表与 wrangler 同名同结构）

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DB, Param, Stmt } from './db.ts';

export function openSqlite(file: string): { db: DB; raw: DatabaseSync } {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

  const db: DB = {
    async all<T>(sql: string, params: Param[] = []) { return raw.prepare(sql).all(...params) as T[]; },
    async first<T>(sql: string, params: Param[] = []) { return (raw.prepare(sql).get(...params) as T | undefined) ?? null; },
    async run(sql: string, params: Param[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
    },
    async batch(stmts: Stmt[]) {
      raw.exec('BEGIN');
      try {
        for (const [sql, params = []] of stmts) raw.prepare(sql).run(...params);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    }
  };
  return { db, raw };
}

export function migrate(raw: DatabaseSync, dir: string): string[] {
  raw.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const done = new Set((raw.prepare('SELECT name FROM d1_migrations').all() as { name: string }[]).map(r => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    raw.exec('BEGIN');
    try {
      raw.exec(readFileSync(join(dir, name), 'utf8'));
      raw.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
      raw.exec('COMMIT');
      applied.push(name);
    } catch (e) {
      raw.exec('ROLLBACK');
      throw e;
    }
  }
  return applied;
}
