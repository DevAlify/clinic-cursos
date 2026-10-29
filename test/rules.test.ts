import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAttribution, type TouchLite } from '../src/core/attribution.ts';
import { alertText, findCoverageDrop, type PointTouch } from '../src/core/monitor.ts';

const t = (seq: number, occurredAt: string, channelLevel: TouchLite['channelLevel'], isTest = false): TouchLite =>
  ({ seq, occurredAt, channelLevel, isTest });

test('attribution takes the first and last touches with a known channel inside the window', () => {
  const touches = [t(1, '2026-10-01T12:00:00Z', 'observed'), t(2, '2026-10-20T12:00:00Z', 'unknown'), t(3, '2026-10-28T12:00:00Z', 'declared')];
  assert.deepEqual(computeAttribution(touches, '2026-10-29T12:00:00Z', 30), { firstSeq: 1, lastSeq: 3, rule: 'known-channel-touch-30d@v1' });
});

test('touches after the opening, unknown channels and test leads never get credit', () => {
  const touches = [t(1, '2026-10-29T12:00:00Z', 'observed'), t(2, '2026-10-29T13:00:00Z', 'observed'), t(3, '2026-10-29T11:00:00Z', 'observed', true)];
  assert.deepEqual(computeAttribution(touches, '2026-10-29T12:00:00Z', 30), { firstSeq: 1, lastSeq: 1, rule: 'known-channel-touch-30d@v1' });
});

test('a 19-day-old touch counts with 30 days and drops out with 14 days', () => {
  const touches = [t(4, '2026-10-10T13:00:00Z', 'observed'), t(9, '2026-10-29T18:30:00Z', 'unknown')];
  assert.equal(computeAttribution(touches, '2026-10-29T18:30:00Z', 30).firstSeq, 4);
  assert.deepEqual(computeAttribution(touches, '2026-10-29T18:30:00Z', 14), { firstSeq: null, lastSeq: null, rule: 'known-channel-touch-14d@v1' });
});

const p = (seq: number, day: number, covered: boolean, isTest = false): PointTouch => ({
  seq, occurredAt: `2026-10-${String(day).padStart(2, '0')}T14:00:00Z`, campaignLevel: covered ? 'observed' : 'unknown', isTest,
});
const baseline = Array.from({ length: 25 }, (_, i) => p(i + 1, i + 3, i !== 6));

test('three leads without campaign after a healthy baseline raise the alert', () => {
  const affected = findCoverageDrop([...baseline, p(30, 29, false), p(31, 29, false), p(32, 29, false)]);
  assert.deepEqual(affected?.map((a) => a.seq), [30, 31, 32]);
});

test('no alert when one of the last three has a campaign, the baseline is small or already weak', () => {
  assert.equal(findCoverageDrop([...baseline, p(30, 29, false), p(31, 29, true), p(32, 29, false)]), null);
  assert.equal(findCoverageDrop([...baseline.slice(0, 5), p(30, 29, false), p(31, 29, false), p(32, 29, false)]), null);
  const weak = baseline.map((b, i) => (i < 5 ? { ...b, campaignLevel: 'unknown' as const } : b));
  assert.equal(findCoverageDrop([...weak, p(30, 29, false), p(31, 29, false), p(32, 29, false)]), null);
});

test('test leads are ignored by the monitor', () => {
  assert.equal(findCoverageDrop([...baseline, p(30, 29, false), p(31, 29, false), p(32, 29, false, true)]), null);
});

test('the alert speaks plain Portuguese with action and owner', () => {
  assert.deepEqual(alertText('LP de harmonização de Campinas', '2026-10-29T17:05:00Z', 3, 'marketing'), {
    message: 'LP de harmonização de Campinas parou de enviar a campanha desde as 14h05. 3 leads afetados.',
    action: 'Conferir a página publicada. Responsável: marketing.',
  });
});
