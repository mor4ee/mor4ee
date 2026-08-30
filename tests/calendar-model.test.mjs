import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarModel} from '../src/widgets/calendar.mjs';

const snapshot = (override = {}) => ({schemaVersion: 1, source: 'demo', year: 2026,
  asOfDate: '2026-08-30', days: [], ...override});

test('calendar covers every day once, with Sunday-first UTC coordinates', () => {
  const model = calendarModel(snapshot());
  assert.equal(model.days.length, 365);
  assert.equal(new Set(model.days.map(d => d.date)).size, 365);
  assert.deepEqual(model.days[0], {date:'2026-01-01', count:null, state:'unknown', column:0, row:4});
  assert.equal(model.days.at(-1).date, '2026-12-31');
  assert.equal(model.columns, 53);
  for (let i = 1; i < model.days.length; i++) {
    assert.equal(Date.parse(model.days[i].date) - Date.parse(model.days[i - 1].date), 86400000);
    assert.equal(model.days[i].row, (model.days[i - 1].row + 1) % 7);
  }
});

test('leap years retain February 29 and can require 54 columns', () => {
  const model = calendarModel(snapshot({year: 2000, asOfDate:'2000-12-31'}));
  assert.equal(model.days.length, 366);
  assert.ok(model.days.some(d => d.date === '2000-02-29'));
  assert.equal(model.columns, 54);
  assert.equal(calendarModel(snapshot({year:2100, asOfDate:'2100-12-31'})).days.length, 365);
});

test('zero, missing data and future days remain distinct', () => {
  const model = calendarModel(snapshot({asOfDate:'2026-01-02', days:[{date:'2026-01-01', count:0}]}));
  assert.deepEqual(model.days.slice(0, 3).map(d => [d.state, d.count]), [['known',0],['unknown',null],['future',null]]);
  assert.deepEqual(model.coverage, {known:1, unknown:1, future:363});
  assert.equal(model.knownTotal, 0);
  assert.equal(model.total, null);
});

test('complete snapshot total excludes future days and input order is irrelevant', () => {
  const days = [{date:'2026-01-02', count:3}, {date:'2026-01-01', count:2}];
  const input = snapshot({asOfDate:'2026-01-02', days});
  const before = JSON.stringify(input);
  const model = calendarModel(input);
  assert.equal(model.total, 5);
  assert.equal(model.coverage.unknown, 0);
  assert.deepEqual(model, calendarModel({...input, days:[...days].reverse()}));
  assert.equal(JSON.stringify(input), before);
});

test('rejects invalid, duplicate, out-of-year and future dates', () => {
  for (const date of ['2026-02-29','2026-1-01','2025-12-31','2026-08-31']) {
    assert.throws(() => calendarModel(snapshot({days:[{date,count:1}]})));
  }
  assert.throws(() => calendarModel(snapshot({days:[{date:'2026-01-01',count:1},{date:'2026-01-01',count:2}]})));
  for (const asOfDate of ['bad','2026-02-30','2025-12-31']) assert.throws(() => calendarModel(snapshot({asOfDate})));
});

test('rejects invalid counts and unsafe totals', () => {
  for (const count of [-1,1.5,'3',null,NaN,Infinity,Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => calendarModel(snapshot({days:[{date:'2026-01-01',count}]})));
  }
  assert.throws(() => calendarModel(snapshot({days:[{date:'2026-01-01',count:Number.MAX_SAFE_INTEGER},{date:'2026-01-02',count:1}]})));
});

test('rejects unexpected metadata and unrecognized sources', () => {
  for (const input of [null, [], snapshot({source:'github'}), snapshot({token:'not-a-token'}),
    snapshot({year:2026.5}), snapshot({schemaVersion:2}), snapshot({days:null}),
    snapshot({days:[{date:'2026-01-01',count:1,repository:'private-name'}]})]) {
    assert.throws(() => calendarModel(input));
  }
});
