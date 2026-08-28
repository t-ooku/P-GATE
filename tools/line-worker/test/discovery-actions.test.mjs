import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDiscoverySearchQuery, socialDiscoverySearchLinks, swippittDiscoveryMatch, gmailShareLink } from '../public/discovery-actions.mjs';

test('Swippitt is identified without requiring the word insert', () => {
  const match = swippittDiscoveryMatch('6個のバッテリーが入っているスマホをすぐ充電できる機械');
  assert.equal(match?.name, 'Swippitt Instant Power System');
  assert.equal(match?.url, 'https://www.swippitt.net/');
  assert.equal(swippittDiscoveryMatch('スマホ用バッテリー'), null);
});

test('social actions search public platforms and share through LINE', () => {
  const links = socialDiscoverySearchLinks('丸く光るライト', 'https://hoshilu.app');
  assert.deepEqual(links.map(link => link.label), ['Instagramで探す', 'Xで探す', 'TikTokで探す', 'YouTubeで探す', 'LINEで共有']);
  assert.deepEqual(links.map(link => link.channel), ['instagram', 'x', 'tiktok', 'youtube', 'line']);
  assert.match(links[0].url, /^https:\/\/www\.instagram\.com\/explore\/search\/keyword\/\?q=/);
  assert.match(links[2].url, /^https:\/\/www\.tiktok\.com\/search\/video\?q=/);
  assert.deepEqual(links.filter(link => ['instagram', 'tiktok'].includes(link.channel)).map(link => link.copy_query), [true, true]);
  assert.deepEqual(links.filter(link => ['instagram', 'tiktok'].includes(link.channel)).map(link => link.search_query), ['丸く光るライト', '丸く光るライト']);
  assert.doesNotMatch(links[0].url, /google\.com\/search/);
  assert.doesNotMatch(links[2].url, /google\.com\/search/);
  assert.match(links[4].url, /^https:\/\/social-plugins\.line\.me\/lineit\/share\?/);
  const lineDestination = new URL(new URL(links[4].url).searchParams.get('url'));
  assert.equal(lineDestination.searchParams.get('q'), '丸く光るライト');
  assert.equal(lineDestination.searchParams.get('utm_source'), 'user_share');
  assert.equal(lineDestination.searchParams.get('utm_medium'), 'line');
  assert.equal(lineDestination.searchParams.get('utm_content'), 'share_line');
});

test('Gmail sharing is a separate helper for the share area, not the social search links', () => {
  const link = gmailShareLink('HOSHILUで探した', '検索を続ける\nhttps://hoshilu.app/?q=x');
  assert.match(link, /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&su=/);
  assert.match(link, /body=/);
});

test('shared query removes contact details', () => {
  assert.equal(safeDiscoverySearchQuery('ライト test@example.com 090-1234-5678'), 'ライト');
});
