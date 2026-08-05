-- HOSHILU GAS→Web移行: gas/ContractPolicyEngine.gs のClient_Contracts /
-- Recommendation_Decisions シートに相当するD1索引。
-- Sheetsが正本のまま。ここはGASからのpush(ベストエフォート)で埋まる
-- 再構築可能な索引として扱う(docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3)。

CREATE TABLE IF NOT EXISTS contracts (
  contract_id TEXT PRIMARY KEY,
  tenant TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL DEFAULT '',
  category_scope TEXT NOT NULL DEFAULT '["*"]',
  competitor_group TEXT NOT NULL DEFAULT '',
  exclusivity_mode TEXT NOT NULL DEFAULT 'NONE',
  competitor_acceptance INTEGER NOT NULL DEFAULT 0,
  benchmark_consent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS contracts_tenant ON contracts (tenant);
CREATE INDEX IF NOT EXISTS contracts_competitor_group ON contracts (competitor_group);

CREATE TABLE IF NOT EXISTS contract_decisions (
  decision_id TEXT PRIMARY KEY,
  decided_at TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  tenant TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  knowledge_key TEXT NOT NULL,
  answer_signature TEXT NOT NULL,
  category TEXT NOT NULL,
  allowed INTEGER NOT NULL,
  reason TEXT NOT NULL,
  disclosure_required INTEGER NOT NULL DEFAULT 0
);

-- competitor_group単位の排他判定(evaluateContractPolicy)が引く経路。
CREATE INDEX IF NOT EXISTS contract_decisions_contract
  ON contract_decisions (contract_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS contract_sync_batches (
  batch_id TEXT PRIMARY KEY,
  received_count INTEGER NOT NULL DEFAULT 0,
  changed_count INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL
);
