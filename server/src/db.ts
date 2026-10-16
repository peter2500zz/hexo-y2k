// 数据库抽象：路由只依赖这个接口。Node 用 sqlite.ts，Cloudflare Workers 用下面的 D1 适配器

export type Param = string | number | null;
export type Stmt = [sql: string, params?: Param[]];

export interface DB {
  all<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
  first<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T | null>;
  run(sql: string, params?: Param[]): Promise<{ changes: number; lastId: number }>;
  /** 原子地执行一组写语句 */
  batch(stmts: Stmt[]): Promise<void>;
}

// ---- Cloudflare D1（只声明用到的部分，免得依赖 workers-types） ----
interface D1Result<T> { results?: T[]; meta?: { changes?: number; last_row_id?: number } }
interface D1Prepared {
  bind(...values: Param[]): D1Prepared;
  all<T>(): Promise<D1Result<T>>;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
}
export interface D1Database {
  prepare(sql: string): D1Prepared;
  batch(stmts: D1Prepared[]): Promise<unknown>;
}

export function d1(db: D1Database): DB {
  const prep = (sql: string, params: Param[] = []) => db.prepare(sql).bind(...params);
  return {
    async all<T>(sql: string, params?: Param[]) { return (await prep(sql, params).all<T>()).results ?? []; },
    async first<T>(sql: string, params?: Param[]) { return await prep(sql, params).first<T>(); },
    async run(sql: string, params?: Param[]) {
      const r = await prep(sql, params).run();
      return { changes: r.meta?.changes ?? 0, lastId: r.meta?.last_row_id ?? 0 };
    },
    async batch(stmts: Stmt[]) {
      if (stmts.length) await db.batch(stmts.map(([sql, params]) => prep(sql, params)));
    }
  };
}
