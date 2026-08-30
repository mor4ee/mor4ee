import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshedProfile,fetchSnapshot,calendarMetadata,refreshedReadme} from '../scripts/refresh-published-profile.mjs';
import {profileSnapshot} from '../src/widgets/github-profile.mjs';
const snapshot={schemaVersion:1,source:'github-profile',year:2026,asOfDate:'2026-01-02',days:[{date:'2026-01-01',count:1},{date:'2026-01-02',count:4}]};
const template='<svg><text>Keep approved artwork and typography</text><!-- CALENDAR_START --><svg x="514" y="348" width="450" height="96" preserveAspectRatio="xMinYMin meet"><style>@font-face{font-family:CurrentMono;src:url(data:font/woff2;base64,TESTFONT)}</style></svg><!-- CALENDAR_END --></svg>';
test('public calendar caption stays short and contains no maintenance instructions',()=>{
  const caption=calendarMetadata('2026-08-30T21:46:15.810Z');
  assert.equal(caption,'<sub>Profile contributions · updated 30 Aug 2026, 21:46 UTC.</sub>');
  assert.doesNotMatch(caption,/PROFILE_TOKEN|workflow|snapshot|successful fetch|\.810/);
  assert.throws(()=>calendarMetadata('invalid'),/timestamp/);
  const readme='Keep profile copy\n<!-- CALENDAR_METADATA_START -->old timestamp<!-- CALENDAR_METADATA_END -->\nKeep footer';
  const updated=refreshedReadme(readme,'2026-08-30T21:46:15.810Z');
  assert.ok(updated.startsWith('Keep profile copy\n'));
  assert.ok(updated.endsWith('\nKeep footer'));
  assert.ok(updated.includes(caption));
  assert.throws(()=>refreshedReadme('missing markers','2026-08-30T21:46:15.810Z'),/metadata missing/);
});
test('refresh preserves placement and unrelated artwork',async()=>{
  const updated=await refreshedProfile(template,snapshot);
  assert.ok(updated.includes('<text>Keep approved artwork and typography</text>'));
  assert.ok(updated.includes('x="514" y="348" width="450" height="96" preserveAspectRatio="xMinYMin meet"'));
  assert.ok(updated.includes('2026-01-02: 4 contributions'));
  assert.equal((updated.match(/CALENDAR_START/g)??[]).length,1);
  assert.ok(!updated.includes('data-date="2026-01-03" data-state="known"'));
});
test('broken template and missing token fail closed',async()=>{
  await assert.rejects(refreshedProfile('<svg/>',snapshot),/font missing/);
  await assert.rejects(refreshedProfile(template+template,snapshot),/exactly one/);
  await assert.rejects(fetchSnapshot(''),/PROFILE_TOKEN/);
});
test('invalid snapshot cannot overwrite last successful render',async()=>{
  await assert.rejects(refreshedProfile(template,{...snapshot,days:[{date:'2026-01-01',count:-1}]}));
});
test('API adapter strips extra fields and rejects incomplete or mismatched data',()=>{
  const response={data:{viewer:{login:'mor4ee',privateInfo:'DO-NOT-PUBLISH',contributionsCollection:{contributionCalendar:{totalContributions:5,weeks:[{contributionDays:[{date:'2026-01-01',contributionCount:1,repository:'DO-NOT-PUBLISH'},{date:'2026-01-02',contributionCount:4}]}]}}}}};
  assert.deepEqual(profileSnapshot(response,'2026-01-02T12:00:00Z'),snapshot);
  response.data.viewer.contributionsCollection.contributionCalendar.totalContributions=10;
  assert.throws(()=>profileSnapshot(response,'2026-01-02T12:00:00Z'),/disagree/);
  assert.throws(()=>profileSnapshot(response,'2026-01-03T12:00:00Z'),/Incomplete/);
  response.data.viewer.login='someone-else';
  assert.throws(()=>profileSnapshot(response,'2026-01-02T12:00:00Z'),/owner/);
});
