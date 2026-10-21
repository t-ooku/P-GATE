import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCampaignUrl, campaignContext } from '../public/campaign-attribution.mjs';
import { readFile } from 'node:fs/promises';
import { campaignRows, parseQueueCsv } from '../../generate-hoshilu-campaign-links.mjs';

test('SNSリンクは投稿テーマと安全な計測値を検索へ引き継ぐ', () => {
  const url = buildCampaignUrl('https://hoshilu.app/', {
    query: 'SNSで見たピンクの小さいカメラ',
    campaign: 'launch_01',
    source: 'instagram',
    content: 'quiz_camera'
  });
  const context = campaignContext(new URL(url).search);
  assert.equal(context.query, 'SNSで見たピンクの小さいカメラ');
  assert.equal(context.campaign, 'launch_01');
  assert.equal(context.source, 'instagram');
});

test('危険な計測IDを破棄し検索文を200文字に制限する', () => {
  const context = campaignContext(`?q=${encodeURIComponent('a'.repeat(250))}&utm_source=<script>`);
  assert.equal(context.query.length, 200);
  assert.equal(context.source, '');
});

test('14日SNSキューの全投稿に検索テーマ付き計測URLを発行する', async () => {
  const csv = await readFile(
    new URL('../../../marketing/social/HOSHILU_14_DAY_EXECUTION_QUEUE.csv', import.meta.url),
    'utf8'
  );
  const rows = campaignRows(parseQueueCsv(csv));
  assert.equal(rows.length, 14);
  rows.forEach((row) => {
    const url = new URL(row.landing_url);
    assert.equal(url.origin, 'https://hoshilu.app');
    assert.ok(url.searchParams.get('q'));
    assert.ok(url.searchParams.get('campaign'));
    assert.ok(url.searchParams.get('utm_source'));
    assert.ok(url.searchParams.get('utm_content'));
    assert.equal(row.status, 'READY');
  });
});
