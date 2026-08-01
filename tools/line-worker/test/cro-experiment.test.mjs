import test from 'node:test';
import assert from 'node:assert/strict';
import { experimentAssignment } from '../public/cro-experiment.mjs';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    values
  };
}

test('CRO割付は匿名端末内で固定される', () => {
  const local = storage();
  const first = experimentAssignment({ storage: local, random: () => 0.9 });
  const second = experimentAssignment({ storage: local, random: () => 0.1 });
  assert.equal(first.variant, 'benefit');
  assert.equal(second.variant, 'benefit');
});

test('QAだけがURLからCROバリアントを固定できる', () => {
  const forced = experimentAssignment({
    search: '?exp=lp_search_cta_v1&variant=benefit',
    attribution: { source: 'qa_acceptance', medium: 'qa' },
    random: () => 0.1
  });
  assert.equal(forced.variant, 'benefit');
  assert.equal(forced.forced, true);
  const publicVisit = experimentAssignment({
    search: '?exp=lp_search_cta_v1&variant=benefit',
    attribution: { source: 'google', medium: 'cpc' },
    random: () => 0.1
  });
  assert.equal(publicVisit.variant, 'control');
  assert.equal(publicVisit.forced, false);
});
