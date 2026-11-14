import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import type { Actor, App, Data, EventV2, Mode, RecordV2 } from "./types";
import { insist } from "./types";

export const timestamp = () => new Date().toISOString();
export const hash = (value: unknown) =>
  createHash("sha256").update(stable(value)).digest("hex");
function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stable(value[k]))
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export class Store {
  readonly db: DatabaseSync;
  constructor(
    public app: App,
    path: string,
    schema?: string,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;",
    );
    if (schema) this.db.exec(schema);
  }
  close() {
    this.db.close();
  }
  all(sql: string, ...values: SQLInputValue[]): Data[] {
    return this.db.prepare(sql).all(...values) as Data[];
  }
  one(sql: string, ...values: SQLInputValue[]): Data | undefined {
    return this.db.prepare(sql).get(...values) as Data | undefined;
  }
  run(sql: string, ...values: SQLInputValue[]) {
    return this.db.prepare(sql).run(...values);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  get(id: string, kind?: string): RecordV2 {
    const row = this.one("SELECT * FROM v2_record WHERE id=?", id);
    insist(
      row && (!kind || row.kind === kind),
      "not_found",
      "Запись не найдена / Record not found",
      404,
    );
    return { ...row, data: JSON.parse(row.data) } as RecordV2;
  }
  list(kind: string, mode?: Mode): RecordV2[] {
    return this.all(
      "SELECT * FROM v2_record WHERE kind=? AND (? IS NULL OR mode=?) ORDER BY createdAt,id",
      kind,
      mode ?? null,
      mode ?? null,
    ).map((r) => ({ ...r, data: JSON.parse(r.data) }) as RecordV2);
  }
  create(
    kind: string,
    actor: Actor,
    data: Data,
    options: Partial<RecordV2> = {},
  ): RecordV2 {
    const at = timestamp();
    const record = {
      id: randomUUID(),
      kind,
      scope: actor.id,
      owner: actor.id,
      mode: actor.mode,
      visibility: "private",
      revision: 1,
      createdAt: at,
      updatedAt: at,
      ...options,
      data,
    } as RecordV2;
    this.run(
      "INSERT INTO v2_record VALUES (?,?,?,?,?,?,?,?,?,?)",
      record.id,
      kind,
      record.scope,
      record.owner,
      record.mode,
      record.visibility,
      1,
      at,
      at,
      JSON.stringify(data),
    );
    return record;
  }
  update(
    record: RecordV2,
    data: Data,
    visibility = record.visibility,
  ): RecordV2 {
    const updatedAt = timestamp();
    const result = this.run(
      "UPDATE v2_record SET data=?,revision=revision+1,updatedAt=?,visibility=? WHERE id=? AND revision=?",
      JSON.stringify(data),
      updatedAt,
      visibility,
      record.id,
      record.revision,
    );
    insist(
      result.changes === 1,
      "revision_conflict",
      "Запись изменена. Обновите страницу / Record changed; refresh",
      409,
    );
    return {
      ...record,
      data,
      visibility,
      updatedAt,
      revision: record.revision + 1,
    };
  }
  request(
    actor: Actor,
    op: string,
    key: string,
    data: Data,
    fn: () => Data,
  ): Data {
    insist(
      /^[a-zA-Z0-9_.:-]{8,160}$/.test(key),
      "idempotency_required",
      "Нужен Idempotency-Key (8–160 знаков) / Idempotency-Key required",
    );
    return this.transaction(() => {
      const digest = hash(data);
      const old = this.one(
        "SELECT * FROM v2_request WHERE actor=? AND op=? AND key=?",
        actor.id,
        op,
        key,
      );
      if (old) {
        insist(
          old.digest === digest,
          "idempotency_conflict",
          "Ключ уже использован с другими данными / Key reused with different payload",
          409,
        );
        return JSON.parse(old.response);
      }
      const result = fn();
      this.run(
        "INSERT INTO v2_request VALUES (?,?,?,?,?,?)",
        actor.id,
        op,
        key,
        digest,
        JSON.stringify(result),
        timestamp(),
      );
      this.create(
        "audit",
        actor,
        { op, requestKey: key, resultId: result.id ?? null },
        { scope: actor.id },
      );
      return result;
    });
  }
  emit(
    type: string,
    actor: Actor,
    entity: RecordV2,
    payload: Data,
    targets: App[],
    verification: EventV2["verification"] = "self_reported",
  ) {
    const sequence =
      Number(
        this.one(
          "SELECT MAX(sequence) AS n FROM v2_event WHERE entityRef=?",
          entity.id,
        )?.n ?? 0,
      ) + 1;
    const event: EventV2 = {
      eventId: randomUUID(),
      schemaVersion: 2,
      type,
      occurredAt: timestamp(),
      producer: this.app,
      subjectRef: actor.id,
      entityRef: entity.id,
      institutionRef: entity.data.institutionId ?? undefined,
      cohortRef: entity.data.cohortId ?? undefined,
      correlationId: entity.id,
      dataMode: entity.mode,
      verification,
      sequence,
      payload,
    };
    this.run(
      "INSERT INTO v2_event VALUES (?,?,?,?,?)",
      event.eventId,
      entity.id,
      sequence,
      JSON.stringify(event),
      timestamp(),
    );
    for (const target of targets)
      if (target !== this.app)
        this.run(
          "INSERT INTO v2_delivery(eventId,target) VALUES (?,?)",
          event.eventId,
          target,
        );
    return event;
  }
  projections(producer?: App): EventV2[] {
    return this.all(
      "SELECT envelope FROM v2_projection WHERE (? IS NULL OR producer=?) ORDER BY receivedAt",
      producer ?? null,
      producer ?? null,
    ).map((r) => JSON.parse(r.envelope));
  }
  map(producer: string, entityType: string, legacyId: string): string {
    const existing = this.one(
      "SELECT globalId FROM v2_identity_map WHERE producer=? AND entityType=? AND legacyId=?",
      producer,
      entityType,
      legacyId,
    );
    if (existing) return existing.globalId;
    const globalId = `legacy-${hash([producer, entityType, legacyId]).slice(0, 32)}`;
    this.run(
      "INSERT INTO v2_identity_map VALUES (?,?,?,?)",
      producer,
      entityType,
      legacyId,
      globalId,
    );
    return globalId;
  }
  rate(key: string, limit = 120) {
    const window = Math.floor(Date.now() / 60000);
    this.run(
      "INSERT INTO v2_rate VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window",
      key,
      window,
    );
    insist(
      Number(this.one("SELECT count FROM v2_rate WHERE key=?", key)?.count) <=
        limit,
      "rate_limit",
      "Слишком много запросов / Too many requests",
      429,
    );
  }
}
