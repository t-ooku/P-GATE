import test from 'node:test';
import assert from 'node:assert/strict';
import { clientSearchFailureTelemetry } from '../public/search-failure-telemetry.mjs';

test('検索縮退は安全コードとUUID形式request IDだけを返す', () => {
  assert.deepEqual(clientSearchFailureTelemetry(
    new Error('TURNSTILE_TOKEN_UNAVAILABLE'),
    'E309D1AD-2A34-4F2F-913B-47FCCDBBE24C'
  ), {
    error_code: 'TURNSTILE_TOKEN_UNAVAILABLE',
    request_id: 'e309d1ad-2a34-4f2f-913b-47fccdbbe24c'
  });
  assert.deepEqual(clientSearchFailureTelemetry(
    new Error('利用者の検索文やURLを含む可能性がある例外'),
    'not-a-request-id'
  ), { error_code: 'SEARCH_CLIENT_FAILURE', request_id: '' });
});

test('ブラウザ例外名を固定された診断コードへ変換する', () => {
  assert.equal(clientSearchFailureTelemetry(Object.assign(new Error('Failed to fetch'), { name: 'TypeError' })).error_code, 'SEARCH_NETWORK_FAILED');
  assert.equal(clientSearchFailureTelemetry(Object.assign(new Error('aborted'), { name: 'AbortError' })).error_code, 'SEARCH_TIMEOUT');
  assert.equal(clientSearchFailureTelemetry(Object.assign(new Error('bad json'), { name: 'SyntaxError' })).error_code, 'SEARCH_RESPONSE_INVALID');
  assert.equal(clientSearchFailureTelemetry({ message: 'arbitrary', status: 503 }).error_code, 'SEARCH_HTTP_503');
});
