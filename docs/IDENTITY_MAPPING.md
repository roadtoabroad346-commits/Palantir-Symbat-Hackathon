# Identity mapping

Canonical new subjects and projects have opaque IDs. Local demonstration catalog IDs are deterministic `demo-<hash>` values so the same fictional profile refers to the same subject across all seven demo apps. New profile events replicate a founder-only identity; they never import arbitrary administrative roles.

`v2_identity_map` has unique `(producer, entityType, legacyId)` and a stable global ID. The portal preserves its existing School records and maps them into canonical institutional workflow records, retaining `legacyId`. School names, nicknames and email addresses are never identity keys. Existing V1 league/challenge IDs and data remain unchanged. This release does not assert that independent real accounts belong to the same person, and it does not automatically merge live legacy users.

Representative appointments are separately reviewed, scoped to one institution, expire, and emit trusted updates. Receivers apply only a newer appointment event. Revocation removes the applicable assignment without granting other institution rights.

Modes are isolated. An identity with multiple roles is still one global person. Projects carry one global ID and primary institution for season credit; optional affiliations do not multiply project counts. Country people counts use the founder's canonical country, while project counts use project country.
