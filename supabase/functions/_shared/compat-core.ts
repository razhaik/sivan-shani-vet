/**
 * Buildy (superdev) compatibility layer on top of Supabase.
 *
 * The app was written against the @superdevhq/client SDK. This module offers the
 * same surface (entity managers, query builder, auth, functions, integrations)
 * but stores everything in Supabase, so the rest of the code keeps working.
 *
 * It is framework-agnostic: the browser build and the Supabase Edge Functions
 * (supabase/functions/_shared) both use a copy of this file.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecord = Record<string, any>;
type Supa = any;

export interface CompatEnvironment {
  /** Supabase client used for data access (anon/session in the browser, service or user in functions). */
  db: () => Supa;
  /** Optional: who is the current user (email), stored in created_by. */
  currentUserEmail?: () => Promise<string | null>;
  /** Entities that anonymous visitors read through a restricted public view. */
  publicViews?: Record<string, string>;
  /** True when there is no signed-in user (browser) – public views are used then. */
  isAnonymous?: () => Promise<boolean>;
}

const PAGE = 1000;

export function tableName(entity: string): string {
  return entity.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase();
}

function applySort(q: any, sort: unknown): any {
  if (!sort) return q;
  const entries: Array<[string, boolean]> = [];
  if (typeof sort === "string") {
    for (const part of sort.split(",").map((s) => s.trim()).filter(Boolean)) {
      entries.push(part.startsWith("-") ? [part.slice(1), false] : [part.replace(/^\+/, ""), true]);
    }
  } else if (typeof sort === "object") {
    for (const [k, v] of Object.entries(sort as AnyRecord)) entries.push([k, !(v === -1 || v === "desc" || v === "-1")]);
  }
  for (const [field, ascending] of entries) q = q.order(field, { ascending, nullsFirst: false });
  return q;
}

function applyWhere(q: any, where: AnyRecord): any {
  for (const [field, cond] of Object.entries(where)) {
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      for (const [op, value] of Object.entries(cond)) {
        switch (op) {
          case "$ne": q = value === null ? q.not(field, "is", null) : q.or(`${field}.is.null,${field}.neq.${String(value)}`); break;
          case "$gt": q = q.gt(field, value); break;
          case "$gte": q = q.gte(field, value); break;
          case "$lt": q = q.lt(field, value); break;
          case "$lte": q = q.lte(field, value); break;
          case "$in": q = q.in(field, value as unknown[]); break;
          case "$nin": q = q.not(field, "in", `(${(value as unknown[]).map((v) => JSON.stringify(v)).join(",")})`); break;
          default: q = q.eq(field, cond); break;
        }
      }
    } else if (cond === null) {
      q = q.is(field, null);
    } else {
      q = q.eq(field, cond);
    }
  }
  return q;
}

/** Strip a column PostgREST says does not exist, so unknown fields never block a save. */
function missingColumn(error: AnyRecord | null): string | null {
  if (!error) return null;
  const msg = String(error.message || "");
  const m = msg.match(/Could not find the '([^']+)' column/);
  return m ? m[1] : null;
}

async function withUnknownColumnRetry(payload: AnyRecord, run: (p: AnyRecord) => Promise<{ data: any; error: any }>) {
  let current = { ...payload };
  for (let i = 0; i < 20; i++) {
    const res = await run(current);
    const col = missingColumn(res.error);
    if (col && col in current) {
      console.warn(`[compat] column "${col}" does not exist – value ignored`);
      const { [col]: _dropped, ...rest } = current;
      current = rest;
      continue;
    }
    return res;
  }
  return run(current);
}

function fail(error: AnyRecord, context: string): never {
  const err = new Error(`API request failed: ${error?.message || context}`) as Error & { status?: number; code?: string };
  err.code = error?.code;
  throw err;
}

export class CompatQuery {
  private conditions: AnyRecord = {};
  private opts: { sort?: unknown; limit?: number; skip?: number; fields?: string } = {};
  constructor(private manager: CompatEntity) {}
  select(fields: string | string[]) { this.opts.fields = Array.isArray(fields) ? fields.join(",") : fields; return this; }
  sort(sort: unknown) { this.opts.sort = sort; return this; }
  limit(n: number) { this.opts.limit = n; return this; }
  skip(n: number) { this.opts.skip = n; return this; }
  where(field: string, value: unknown) { this.conditions[field] = value; return this; }
  equals(field: string, value: unknown) { return this.where(field, value); }
  notEquals(field: string, value: unknown) { this.conditions[field] = { $ne: value }; return this; }
  gt(f: string, v: unknown) { this.conditions[f] = { ...(this.conditions[f] || {}), $gt: v }; return this; }
  gte(f: string, v: unknown) { this.conditions[f] = { ...(this.conditions[f] || {}), $gte: v }; return this; }
  lt(f: string, v: unknown) { this.conditions[f] = { ...(this.conditions[f] || {}), $lt: v }; return this; }
  lte(f: string, v: unknown) { this.conditions[f] = { ...(this.conditions[f] || {}), $lte: v }; return this; }
  in(f: string, v: unknown[]) { this.conditions[f] = { $in: v }; return this; }
  nin(f: string, v: unknown[]) { this.conditions[f] = { $nin: v }; return this; }
  exec() { return this.manager.run(this.conditions, this.opts); }
  async count() { const r = await this.manager.run(this.conditions, { ...this.opts, limit: 1 }); return (r as any).total; }
  async first() { const r = await this.manager.run(this.conditions, { ...this.opts, limit: 1 }); return r[0] ?? null; }
}

export class CompatEntity {
  constructor(private env: CompatEnvironment, private entityName: string) {}

  private async source(forRead: boolean): Promise<string> {
    const table = tableName(this.entityName);
    const view = this.env.publicViews?.[this.entityName];
    if (forRead && view && this.env.isAnonymous && (await this.env.isAnonymous())) return view;
    return table;
  }

  async run(where: AnyRecord, opts: { sort?: unknown; limit?: number; skip?: number; fields?: string }) {
    const db = this.env.db();
    const src = await this.source(true);
    const skip = Math.max(0, Number(opts.skip) || 0);
    const wanted = opts.limit && opts.limit > 0 ? opts.limit : Infinity;
    const rows: AnyRecord[] = [];
    let total = 0;
    let offset = skip;
    while (rows.length < wanted) {
      const size = Math.min(PAGE, wanted - rows.length);
      let q = db.from(src).select(opts.fields || "*", { count: "exact" });
      q = applyWhere(q, where);
      q = applySort(q, opts.sort || "-created_at");
      q = q.range(offset, offset + size - 1);
      const { data, error, count } = await q;
      if (error) fail(error, `list ${this.entityName}`);
      total = count ?? total;
      rows.push(...(data || []));
      if (!data || data.length < size) break;
      offset += data.length;
    }
    // The Buildy API answered list/filter/query with a plain array, so the app expects one.
    return Object.assign(rows, { total: total || rows.length });
  }

  query() { return new CompatQuery(this); }
  find(query?: AnyRecord, options?: AnyRecord) {
    const q = this.query();
    if (query) for (const [k, v] of Object.entries(query)) q.where(k, v);
    if (options?.sort) q.sort(options.sort);
    if (options?.limit) q.limit(options.limit);
    if (options?.skip) q.skip(options.skip);
    if (options?.fields) q.select(options.fields);
    return q;
  }
  filter(query?: AnyRecord, sort?: unknown, limit?: number, skip?: number, fields?: string) {
    return this.find(query, { sort, limit, skip, fields }).exec();
  }
  /**
   * list(options) like the SDK. The app also calls list("-created_at", 500): the original
   * SDK ignored those positional arguments and returned every record, so the sort is kept
   * and the limit ignored here too – otherwise lists (e.g. 3,000+ clients) would be cut.
   */
  list(options?: AnyRecord | string, _limit?: number) {
    if (typeof options === "string") return this.find({}, { sort: options }).exec();
    return this.find({}, options || {}).exec();
  }
  async get(id: string) {
    const { data, error } = await this.env.db().from(await this.source(true)).select("*").eq("id", id).maybeSingle();
    if (error) fail(error, `get ${this.entityName}`);
    if (!data) { const e = new Error("API request failed: not found") as Error & { status?: number }; e.status = 404; throw e; }
    return data;
  }
  async create(input: AnyRecord) {
    const db = this.env.db();
    const table = tableName(this.entityName);
    const payload: AnyRecord = { ...input };
    if (payload.id === undefined || payload.id === null || payload.id === "") delete payload.id;
    if (!payload.created_by && this.env.currentUserEmail) payload.created_by = (await this.env.currentUserEmail()) || "anonymous";
    const { data, error } = await withUnknownColumnRetry(payload, (p) => db.from(table).insert(p).select("*").single());
    if (error) fail(error, `create ${this.entityName}`);
    return data;
  }
  async bulkCreate(items: AnyRecord[]) {
    const out: AnyRecord[] = [];
    for (const item of items) out.push(await this.create(item));
    return out;
  }
  async update(id: string, input: AnyRecord) {
    const db = this.env.db();
    const table = tableName(this.entityName);
    const { id: _ignored, created_at: _c, ...rest } = input || {};
    const payload = { ...rest, updated_at: new Date().toISOString() };
    const { data, error } = await withUnknownColumnRetry(payload, (p) => db.from(table).update(p).eq("id", id).select("*").maybeSingle());
    if (error) fail(error, `update ${this.entityName}`);
    return data ?? { id, ...payload };
  }
  async delete(id: string) {
    const { error } = await this.env.db().from(tableName(this.entityName)).delete().eq("id", id);
    if (error) fail(error, `delete ${this.entityName}`);
    return { success: true, id };
  }
  async deleteMany(ids: string[]) {
    const { error } = await this.env.db().from(tableName(this.entityName)).delete().in("id", ids);
    if (error) fail(error, `delete ${this.entityName}`);
    return { success: true, deleted: ids.length };
  }
  batch() {
    return {
      create: (items: AnyRecord[]) => this.bulkCreate(items),
      update: async (updates: AnyRecord[]) => {
        const results: AnyRecord[] = [];
        for (const u of updates) {
          const id = u.id ?? u._id;
          const data = u.data ?? (() => { const { id: _i, _id: _j, ...rest } = u; return rest; })();
          results.push(await this.update(String(id), data));
        }
        return { success: true, updated: results.length, data: results };
      },
      delete: (ids: string[]) => this.deleteMany(ids),
    };
  }
}

export function makeEntities(env: CompatEnvironment) {
  const cache = new Map<string, CompatEntity>();
  const entity = (name: string) => {
    if (!cache.has(name)) cache.set(name, new CompatEntity(env, name));
    return cache.get(name)!;
  };
  const entities = new Proxy({}, {
    get: (_t, name) => (typeof name === "string" && name !== "then" && !name.startsWith("_") ? entity(name) : undefined),
  }) as Record<string, CompatEntity>;
  return { entity, entities };
}
