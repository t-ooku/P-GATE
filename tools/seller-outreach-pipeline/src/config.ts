export interface RuntimeConfig {
  dryRun: boolean;
  plannedLogPath: string;
  blockedDir: string;
  ledgerPath: string;
}

/** Only the literal false disables the environment guard; typos fail closed. */
export function environmentDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.DRY_RUN ?? 'true').trim().toLowerCase();
  if (!['true', 'false'].includes(raw)) throw new Error('DRY_RUN_MUST_BE_TRUE_OR_FALSE');
  return raw !== 'false';
}

export function readConfig(env: NodeJS.ProcessEnv = process.env,
  args: string[] = process.argv.slice(2)): RuntimeConfig {
  return {
    dryRun: environmentDryRun(env) || !args.includes('--send'),
    plannedLogPath: env.PLANNED_LOG_PATH || 'logs/planned.jsonl',
    blockedDir: env.BLOCKED_DIR || 'logs/blocked',
    ledgerPath: env.LEDGER_PATH || 'data/submissions.db'
  };
}
