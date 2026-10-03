#!/usr/bin/env node
// 2026-10-03 Cowork 依頼 §10（既定 a）: 月曜 07:00 JST に、今週の AI販促担当の結果を docs/handoff/ の週次ファイルに追記する。
// Cowork は管理 API に届かないので、結果はリポジトリで読む。書くのは状態・検査理由・原価だけ。本文（記事・SNS 原稿）や
// 店の連絡先は書かない。本番 D1 は読むだけ（wrangler d1 execute --remote、CI と同じ CLOUDFLARE_API_TOKEN）。
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promoWeekKey } from '../src/seller-promo-store.mjs';

const WEEK_KEY = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/u;
const parse = (value) => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const cell = (value) => String(value ?? '').replace(/[|\r\n]+/gu, ' ').slice(0, 160);
const codes = (items = []) => (Array.isArray(items) ? items : []).map((r) => `${r.code}${r.detail ? `:${r.detail}` : ''}`).join(' / ');

// JST の日付（YYYY-MM-DD）
export function jstDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

// data: { weekKey, now, jobs:[{seller_key,status,attempt,error,started_at,finished_at}],
//         deliverables:[{seller_key,type,version,status,qa}], usage:[{seller_key,calls,input_tokens,output_tokens,cost_jpy}] }
export function formatWeeklyRecord({ weekKey, now = new Date(), jobs = [], deliverables = [], usage = [] }) {
  const lines = [`## ${weekKey}（記録 ${jstDate(now)} ${new Date(now.getTime() + 9 * 3600_000).toISOString().slice(11, 16)} JST、自動）`, ''];
  if (!jobs.length) {
    lines.push('今週の job はまだありません（月曜 06:00 JST の起動前、または対象の店なし）。', '');
    return lines.join('\n');
  }
  lines.push('### job', '', '| 店 | 状態 | 試行 | error | 開始 | 終了 |', '|---|---|---|---|---|---|');
  for (const j of jobs) lines.push(`| ${cell(j.seller_key)} | ${cell(j.status)} | ${cell(j.attempt)} | ${cell(j.error)} | ${cell(j.started_at)} | ${cell(j.finished_at)} |`);
  lines.push('', '### 納品物（最新の版だけでなく全版。本文は書かない）', '', '| 店 | 種類 | 版 | 状態 | 検査理由 | 要確認 |', '|---|---|---|---|---|---|');
  for (const d of deliverables) {
    const qa = parse(d.qa);
    lines.push(`| ${cell(d.seller_key)} | ${cell(d.type)} | ${cell(d.version)} | ${cell(d.status)} | ${cell(codes(qa.reasons)) || '—'} | ${cell(codes(qa.notes)) || '—'} |`);
  }
  lines.push('', '### 原価', '', '| 店 | 呼び出し | 入力トークン | 出力トークン | 円（推定） |', '|---|---|---|---|---|');
  for (const u of usage) lines.push(`| ${cell(u.seller_key)} | ${cell(u.calls)} | ${cell(u.input_tokens)} | ${cell(u.output_tokens)} | ${cell(u.cost_jpy)} |`);
  if (!usage.length) lines.push('| — | 0 | 0 | 0 | 0 |');
  const failed = jobs.filter((j) => j.status !== 'DONE').length;
  const qaFailed = deliverables.filter((d) => d.status === 'QA_FAILED').length;
  const noted = deliverables.filter((d) => (parse(d.qa).notes || []).length).length;
  lines.push('', `まとめ: job ${jobs.length} 件（DONE 以外 ${failed}）・納品物 ${deliverables.length} 版（QA_FAILED ${qaFailed}・要確認 ${noted}）。`, '');
  return lines.join('\n');
}

function d1(sql) {
  const out = execFileSync('npx', ['--yes', 'wrangler@4.121.0', 'd1', 'execute', 'hoshilu-products', '--remote', '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(out)[0]?.results || [];
}

async function main() {
  const now = new Date();
  const weekKey = process.env.WEEK_KEY || promoWeekKey(now);
  if (!WEEK_KEY.test(weekKey)) throw new Error('WEEK_KEY_INVALID');
  const jobs = d1(`SELECT seller_key,status,attempt,error,started_at,finished_at FROM seller_promo_jobs WHERE week_key='${weekKey}' ORDER BY seller_key`);
  const deliverables = d1(`SELECT seller_key,type,version,status,qa FROM seller_promo_deliverables WHERE week_key='${weekKey}' ORDER BY seller_key,type,version`);
  const usage = d1(`SELECT u.seller_key,COUNT(*) AS calls,SUM(u.input_tokens) AS input_tokens,SUM(u.output_tokens) AS output_tokens,ROUND(SUM(u.cost_jpy_est),2) AS cost_jpy
    FROM seller_promo_usage u JOIN seller_promo_jobs j ON j.id=u.job_id WHERE j.week_key='${weekKey}' GROUP BY u.seller_key ORDER BY u.seller_key`);
  const file = resolve(process.env.RECORD_FILE || `../../docs/handoff/${jstDate(now)}-seller-promo-weekly.md`);
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) {
    writeFileSync(file, `# AI販促担当 週次の結果（自動記録）\n\n\`seller-promo-weekly-record.yml\`（月曜 07:00 JST）が本番 D1 を読んで追記する。状態・検査理由・原価だけで、本文と連絡先は書かない。\n\n`);
  }
  appendFileSync(file, `${formatWeeklyRecord({ weekKey, now, jobs, deliverables, usage })}\n`);
  console.log(`recorded ${weekKey} -> ${file} (jobs ${jobs.length}, deliverables ${deliverables.length})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error?.message || error); process.exit(1); });
}
