// OpenAI is an optional backup, never a prerequisite for HOSHILU search.
// A key only proves that credentials exist; it does not prove that API billing
// is enabled. Require an explicit operational switch so an unpaid/disabled
// account is skipped without consuming the user's search deadline.
export function openAiBackupEnabled(env = {}) {
  return String(env.OPENAI_API_KEY || '').length >= 20
    && String(env.OPENAI_BACKUP_ENABLED || '').trim().toLowerCase() === 'true';
}
