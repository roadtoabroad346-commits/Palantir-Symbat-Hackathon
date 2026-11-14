-- Additive V2 aggregate storage. Each app owns its own tables, never another app's DB.
CREATE TABLE IF NOT EXISTS v2_record (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, scope TEXT NOT NULL, owner TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('demo','pilot','production')),
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','cohort','institution','public')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE INDEX IF NOT EXISTS v2_record_kind_scope ON v2_record(kind,scope,mode);
CREATE INDEX IF NOT EXISTS v2_record_owner ON v2_record(owner,kind);
CREATE TABLE IF NOT EXISTS v2_identity_map (
 producer TEXT NOT NULL, entityType TEXT NOT NULL, legacyId TEXT NOT NULL, globalId TEXT NOT NULL,
 PRIMARY KEY(producer,entityType,legacyId)
);
CREATE TABLE IF NOT EXISTS v2_request (
 actor TEXT NOT NULL, op TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL,
 response TEXT NOT NULL CHECK(json_valid(response)), createdAt TEXT NOT NULL,
 PRIMARY KEY(actor,op,key)
);
CREATE TABLE IF NOT EXISTS v2_event (
 eventId TEXT PRIMARY KEY, entityRef TEXT NOT NULL, sequence INTEGER NOT NULL,
 envelope TEXT NOT NULL CHECK(json_valid(envelope)), createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS v2_delivery (
 eventId TEXT NOT NULL REFERENCES v2_event(eventId), target TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, deliveredAt TEXT, lastError TEXT,
 PRIMARY KEY(eventId,target)
);
CREATE TABLE IF NOT EXISTS v2_inbox (
 producer TEXT NOT NULL, eventId TEXT NOT NULL, entityRef TEXT NOT NULL,
 sequence INTEGER NOT NULL, receivedAt TEXT NOT NULL, envelope TEXT NOT NULL CHECK(json_valid(envelope)),
 PRIMARY KEY(producer,eventId)
);
CREATE TABLE IF NOT EXISTS v2_projection (
 producer TEXT NOT NULL, entityRef TEXT NOT NULL, sequence INTEGER NOT NULL,
 receivedAt TEXT NOT NULL, envelope TEXT NOT NULL CHECK(json_valid(envelope)),
 PRIMARY KEY(producer,entityRef)
);
CREATE TABLE IF NOT EXISTS v2_ledger (
 id TEXT PRIMARY KEY, walletId TEXT NOT NULL, amount INTEGER NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('service_credit','sponsor_entitlement')),
 reference TEXT NOT NULL UNIQUE, mode TEXT NOT NULL CHECK(mode IN ('demo','pilot','production')),
 createdAt TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS v2_ledger_no_update BEFORE UPDATE ON v2_ledger BEGIN SELECT RAISE(ABORT,'append-only ledger'); END;
CREATE TRIGGER IF NOT EXISTS v2_ledger_no_delete BEFORE DELETE ON v2_ledger BEGIN SELECT RAISE(ABORT,'append-only ledger'); END;
CREATE TABLE IF NOT EXISTS v2_hold (
 id TEXT PRIMARY KEY, walletId TEXT NOT NULL, bookingId TEXT NOT NULL UNIQUE,
 amount INTEGER NOT NULL CHECK(amount >= 0), expiresAt TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('held','captured','released','expired'))
);
CREATE TABLE IF NOT EXISTS v2_setting (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS v2_rate (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
