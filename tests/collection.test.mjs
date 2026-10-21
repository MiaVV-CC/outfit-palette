import test from 'node:test';
import assert from 'node:assert/strict';
import {filterLooks,chooseLook} from '../skill/web/lib/collection.mjs';

test('收藏筛选与今日穿搭挑选',()=>{
const records=[
  {id:'a',tags:{weather:'冷',occasion:'通勤',moods:['低调']},wornDates:['2026-10-19']},
  {id:'b',tags:{weather:'冷',occasion:'通勤',moods:['低调']},wornDates:[]},
  {id:'c',tags:{weather:'热',occasion:'日常',moods:['放松']},wornDates:[]}
];
assert.deepEqual(filterLooks(records,{weather:'冷'}).map(r=>r.id),['a','b']);
assert.deepEqual(filterLooks(records,{mood:'放松'}).map(r=>r.id),['c']);
assert.equal(chooseLook(records,{weather:'冷',occasion:'通勤',mood:'低调'},[],'2026-10-20').record.id,'b');
assert.equal(chooseLook(records,{weather:'冷',occasion:'通勤',mood:'低调'},['b'],'2026-10-20').record.id,'a');
assert.equal(chooseLook(records,{weather:'温和',occasion:'约会'},[],'2026-10-20').exact,false);
assert.equal(chooseLook([],{weather:'冷',occasion:'通勤'}),null);
});
