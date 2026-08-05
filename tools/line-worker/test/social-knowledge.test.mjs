import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redactPersonalData, extractHashtags, moderateContent, ingest, ingestMany, review, rebuildAggregates
} from '../src/social-knowledge.mjs';

test('redactPersonalDataはメール・URL・アカウント・電話番号を匿名化する', () => {
  const result = redactPersonalData('連絡先はtest@example.comか090-1234-5678、URLはhttps://example.com/x @handle');
  assert.equal(result, '連絡先は[EMAIL]か[PHONE]、URLは[URL] [HANDLE]');
});

test('extractHashtagsは重複(大文字小文字を無視)を除いて最大20件返す', () => {
  assert.deepEqual(extractHashtags('好き #HOSHILU 便利 #お買い物 #hoshilu'), ['hoshilu', 'お買い物']);
  const many = Array.from({ length: 25 }, (_, i) => `#tag${i}`).join(' ');
  assert.equal(extractHashtags(many).length, 20);
});

test('moderateContentは高危険度パターンを自動除外し、境界事例は要確認にする', () => {
  assert.equal(moderateContent('死ね').status, 'AUTO_REJECTED');
  assert.equal(moderateContent('このアプリ最高、フォローしてね').status, 'REVIEW_FLAGGED');
  assert.equal(moderateContent('ちょっと使いにくいけどまあまあ').status, 'REVIEW');
});

test('moderateContentはFLAG/AUTO_REJECT対象外のAIカテゴリかつ低確信度ならREVIEWのままにする', () => {
  const result = moderateContent('普通のコメント', { categories: ['MISC'], confidence: 0.3 });
  assert.equal(result.status, 'REVIEW');
});

test('moderateContentはFLAG_CATEGORIES該当のAIカテゴリなら確信度に関わらずREVIEW_FLAGGEDにする', () => {
  const result = moderateContent('普通のコメント', { categories: ['HARASSMENT'], confidence: 0.1 });
  assert.equal(result.status, 'REVIEW_FLAGGED');
});

test('moderateContentはAI判定が高確信度なら自動除外の対象カテゴリで除外する', () => {
  const result = moderateContent('普通のコメント', { categories: ['THREAT'], confidence: 0.9 });
  assert.equal(result.status, 'AUTO_REJECTED');
});

function createFakeD1() {
  const inbox = new Map();
  const aggregates = [];
  const hashtags = [];

  function run(sql, values) {
    if (/^INSERT INTO social_knowledge_inbox/.test(sql)) {
      const [response_id, collected_at, source, post_id, campaign_id, response_type, response_text_redacted,
        poll_option, language, consent_basis, disclosure_version, author_hash, duplicate_hash,
        suggested_category, suggested_need_key, approved_category, approved_need_key, review_status,
        reviewed_at, reviewer, exclusion_reason] = values;
      inbox.set(response_id, {
        response_id, collected_at, source, post_id, campaign_id, response_type, response_text_redacted,
        poll_option, language, consent_basis, disclosure_version, author_hash, duplicate_hash,
        suggested_category, suggested_need_key, approved_category, approved_need_key, review_status,
        reviewed_at, reviewer, exclusion_reason
      });
      return { meta: { changes: 1 } };
    }
    if (/^UPDATE social_knowledge_inbox/.test(sql)) {
      const [responseId, approvedCategory, approvedNeedKey, status, reviewedAt, reviewer, exclusionReason] = values;
      const row = inbox.get(responseId);
      Object.assign(row, {
        approved_category: approvedCategory, approved_need_key: approvedNeedKey,
        review_status: status, reviewed_at: reviewedAt, reviewer, exclusion_reason: exclusionReason
      });
      return { meta: { changes: 1 } };
    }
    if (/^DELETE FROM social_knowledge_aggregates/.test(sql)) { aggregates.length = 0; return { meta: { changes: 0 } }; }
    if (/^DELETE FROM social_hashtag_aggregates/.test(sql)) { hashtags.length = 0; return { meta: { changes: 0 } }; }
    if (/^INSERT INTO social_knowledge_aggregates/.test(sql)) { aggregates.push(values); return { meta: { changes: 1 } }; }
    if (/^INSERT INTO social_hashtag_aggregates/.test(sql)) { hashtags.push(values); return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  }

  return {
    inbox, aggregates, hashtags,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (/duplicate_hash = \?1/.test(sql)) {
                for (const row of inbox.values()) if (row.duplicate_hash === values[0]) return { response_id: row.response_id };
                return null;
              }
              if (/response_id = \?1/.test(sql) && /^SELECT/.test(sql)) {
                return inbox.has(values[0]) ? { response_id: values[0] } : null;
              }
              return null;
            },
            async run() { return run(sql, values); }
          };
        },
        async all() {
          if (/FROM social_knowledge_inbox WHERE review_status = 'APPROVED'/.test(sql)) {
            return { results: [...inbox.values()].filter((row) => row.review_status === 'APPROVED') };
          }
          return { results: [] };
        },
        async run() { return run(sql, []); }
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((s) => s.run()));
    }
  };
}

function baseRequest(overrides = {}) {
  return {
    source: 'instagram', response_type: 'comment', consent_basis: 'explicit', disclosure_version: 'v1',
    post_id: 'P1', platform_response_id: 'R1', response_text: 'HOSHILUで探し物が見つかった',
    author_platform_id: 'user-1', language: 'ja', ...overrides
  };
}

test('ingestは同じpost_id+platform_response_idの重複をDUPLICATEとして返す', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  const first = await ingest(env, baseRequest());
  assert.equal(first.status, 'REVIEW');
  const duplicate = await ingest(env, baseRequest());
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.equal(duplicate.response_id, first.response_id);
});

test('ingestは本文もPoll_Optionも無い場合エラーにする', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  await assert.rejects(() => ingest(env, baseRequest({ response_text: '', poll_option: '' })), /SOCIAL_RESPONSE_EMPTY/);
});

test('ingestは許可値外のsource/response_type/consent_basisを拒否する', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  await assert.rejects(() => ingest(env, baseRequest({ source: 'FACEBOOK' })), /SOCIAL_SOURCE_INVALID/);
  await assert.rejects(() => ingest(env, baseRequest({ response_type: 'DM' })), /SOCIAL_RESPONSE_TYPE_INVALID/);
  await assert.rejects(() => ingest(env, baseRequest({ consent_basis: 'IMPLIED' })), /SOCIAL_CONSENT_REQUIRED/);
});

test('ingestManyは1件の失敗がバッチ全体を止めずERROR結果を積む', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  const results = await ingestMany(env, [
    baseRequest({ platform_response_id: 'R1' }),
    baseRequest({ platform_response_id: 'R2', source: 'INVALID' })
  ]);
  assert.equal(results[0].status, 'REVIEW');
  assert.equal(results[1].status, 'ERROR');
  assert.equal(results[1].error.code, 'SOCIAL_SOURCE_INVALID');
});

test('reviewは承認時にcategory/need_keyを必須にし、rebuildAggregatesを呼ぶ', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  const ingested = await ingest(env, baseRequest());
  await assert.rejects(() => review(env, ingested.response_id, { status: 'APPROVED' }), /SOCIAL_CATEGORY_REQUIRED/);
  const approved = await review(env, ingested.response_id, { status: 'APPROVED', category: 'kitchen', need_key: 'compact-kettle', reviewer: 'ops' });
  assert.equal(approved.status, 'APPROVED');
  const row = env.PRODUCT_DB.inbox.get(ingested.response_id);
  assert.equal(row.approved_category, 'KITCHEN');
  assert.equal(row.approved_need_key, 'compact-kettle');
});

test('reviewは存在しないresponse_idにSOCIAL_RESPONSE_NOT_FOUNDを投げる', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  await assert.rejects(() => review(env, 'missing', { status: 'REJECTED' }), /SOCIAL_RESPONSE_NOT_FOUND/);
});

test('rebuildAggregatesは承認済み行だけを需要キー別・ハッシュタグ別に集計する', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  const a = await ingest(env, baseRequest({ platform_response_id: 'R1', response_text: '#HOSHILU 最高の圧縮ケトル' }));
  const b = await ingest(env, baseRequest({ platform_response_id: 'R2', response_text: '#hoshilu 圧縮ケトルまた買う' }));
  await ingest(env, baseRequest({ platform_response_id: 'R3', response_text: '普通のコメント' }));
  await review(env, a.response_id, { status: 'APPROVED', category: 'kitchen', need_key: 'compact-kettle' });
  const result = await review(env, b.response_id, { status: 'APPROVED', category: 'kitchen', need_key: 'compact-kettle' });
  assert.equal(result.status, 'APPROVED');
  const aggregateResult = await rebuildAggregates(env);
  assert.equal(aggregateResult.aggregate_count, 1);
  assert.equal(aggregateResult.hashtag_count, 1);
});

test('rebuildAggregatesはD1未設定ならskipする', async () => {
  assert.deepEqual(await rebuildAggregates({}), { skipped: true });
});
