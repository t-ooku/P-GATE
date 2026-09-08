import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDiscoverySearchQuery, socialDiscoverySearchLinks, swippittDiscoveryMatch } from '../public/discovery-actions.mjs';

test('Swippitt is identified without requiring the word insert', () => {
  const match = swippittDiscoveryMatch('6個のバッテリーが入っているスマホをすぐ充電できる機械');
  assert.equal(match?.name, 'Swippitt Instant Power System');
  assert.equal(match?.url, 'https://www.swippitt.net/');
  assert.equal(swippittDiscoveryMatch('スマホ用バッテリー'), null);
});

test('social actions search public platforms and share through LINE and Gmail', () => {
  const links = socialDiscoverySearchLinks('丸く光るライト', 'https://hoshilu.app');
  assert.deepEqual(links.map(link => link.label), ['Instagram', 'X', 'TikTok', 'YouTube', 'LINEで共有', 'Gmailで送る']);
  assert.match(links[0].url, /^https:\/\/www\.instagram\.com\/explore\/search\/keyword\/\?q=/);
  assert.match(links[2].url, /^https:\/\/www\.tiktok\.com\/search\?q=/);
  assert.doesNotMatch(links[0].url, /google\.com\/search/);
  assert.doesNotMatch(links[2].url, /google\.com\/search/);
  assert.match(links[4].url, /^https:\/\/social-plugins\.line\.me\/lineit\/share\?/);
  assert.match(links[5].url, /^https:\/\/mail\.google\.com\/mail\/\?/);
});

test('shared query removes contact details', () => {
  assert.equal(safeDiscoverySearchQuery('ライト test@example.com 090-1234-5678'), 'ライト');
});
