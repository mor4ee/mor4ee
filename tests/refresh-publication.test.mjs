import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,stat,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {refreshedProfile,refreshedReadme,refreshPublishedProfile,fetchSnapshot} from '../scripts/refresh-published-profile.mjs';

const snapshot={schemaVersion:1,source:'github-profile',year:2026,asOfDate:'2026-01-02',days:[{date:'2026-01-01',count:1},{date:'2026-01-02',count:4}]};
const publishedAt='2026-01-02T01:00:00Z';
const checkedAt='2026-01-02T07:00:00Z';
const readme='Approved copy\n<!-- CALENDAR_METADATA_START -->old<!-- CALENDAR_METADATA_END -->\nApproved footer';
const template=x=>`<svg><text>Approved artwork</text><!-- CALENDAR_START --><svg x="${x}" width="450"><style>@font-face{font-family:CurrentMono;src:url(data:font/woff2;base64,TESTFONT)}</style></svg><!-- CALENDAR_END --><desc>Snapshot through 2026-01-02; aggregate counts only.</desc></svg>`;
const paths=['assets/profile.svg','assets/profile.mobile.svg','README.md'];
async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'profile-refresh-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,'assets'));
  const contents=[await refreshedProfile(template(514),snapshot),await refreshedProfile(template(24),snapshot),refreshedReadme(readme,publishedAt)];
  for(const [i,path] of paths.entries()) {
    await writeFile(join(dir,path),contents[i]);
    await utimes(join(dir,path),new Date('2020-01-01Z'),new Date('2020-01-01Z'));
  }
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
  git('init','--quiet'); git('add','.');
  git('-c','user.name=Test','-c','user.email=test@example.com','commit','--quiet','-m','fixture');
  const summaryPath=join(dir,'summary.md');
  const options={root:pathToFileURL(`${dir}/`),summaryPath};
  return {dir,contents,git,summaryPath,options};
}

test('unchanged snapshot at a later check leaves every published byte and mtime intact; git has nothing to commit',async t=>{
  const f=await fixture(t);
  const mtimes=await Promise.all(paths.map(path=>stat(join(f.dir,path)).then(s=>s.mtimeMs)));
  // API record order is not a content change.
  const result=await refreshPublishedProfile({snapshot:{...snapshot,days:[...snapshot.days].reverse()},fetchedAt:checkedAt},f.options);
  assert.equal(result.changed,false);
  for(const [i,path] of paths.entries()) {
    assert.equal(await readFile(join(f.dir,path),'utf8'),f.contents[i]);
    assert.equal((await stat(join(f.dir,path))).mtimeMs,mtimes[i]);
  }
  f.git('add','--',...paths);
  assert.equal(f.git('diff','--cached','--name-only'),'');
  assert.match(await readFile(f.summaryPath,'utf8'),/Source checked successfully: 2026-01-02T07:00:00.000Z/);
  assert.match(await readFile(f.summaryPath,'utf8'),/Publication: unchanged/);
});

test('changed exact counts update both SVGs and publication time, even within the same color bin',async t=>{
  const f=await fixture(t);
  const changed={...snapshot,days:[snapshot.days[0],{date:'2026-01-02',count:5}]};
  assert.equal((await refreshPublishedProfile({snapshot:changed,fetchedAt:checkedAt},f.options)).changed,true);
  for(const path of paths.slice(0,2)) assert.match(await readFile(join(f.dir,path),'utf8'),/2026-01-02: 5 contributions/);
  assert.equal(await readFile(join(f.dir,'README.md'),'utf8'),refreshedReadme(readme,checkedAt));
  f.git('add','--',...paths);
  assert.deepEqual(f.git('diff','--cached','--name-only').split('\n').sort(),[...paths].sort());
  assert.equal((await refreshPublishedProfile({snapshot:changed,fetchedAt:'2026-01-02T13:00:00Z'},f.options)).changed,false);
});

test('next UTC date with no additional contributions advances cutoff and zero-day coverage',async t=>{
  const f=await fixture(t);
  const next={...snapshot,asOfDate:'2026-01-03',days:[...snapshot.days,{date:'2026-01-03',count:0}]};
  assert.equal((await refreshPublishedProfile({snapshot:next,fetchedAt:'2026-01-03T00:17:00Z'},f.options)).changed,true);
  for(const path of paths.slice(0,2)) {
    const svg=await readFile(join(f.dir,path),'utf8');
    assert.match(svg,/snapshot cutoff 2026-01-03/);
    assert.match(svg,/2026-01-03: 0 contributions/);
    assert.match(svg,/Snapshot through 2026-01-03; aggregate counts only/);
    assert.equal(svg.replace(/<!-- CALENDAR_START -->[\s\S]*?<!-- CALENDAR_END -->/,'CALENDAR').replace('2026-01-03;','2026-01-02;'),f.contents[paths.indexOf(path)].replace(/<!-- CALENDAR_START -->[\s\S]*?<!-- CALENDAR_END -->/,'CALENDAR'));
  }
  assert.match(await readFile(join(f.dir,'README.md'),'utf8'),/updated 3 Jan 2026, 00:17 UTC/);
});

test('a broken mobile template prevents all writes and a success summary',async t=>{
  const f=await fixture(t);
  await writeFile(join(f.dir,paths[1]),'<svg/>');
  await assert.rejects(refreshPublishedProfile({snapshot,fetchedAt:checkedAt},f.options),/font missing/);
  assert.equal(await readFile(join(f.dir,paths[0]),'utf8'),f.contents[0]);
  assert.equal(await readFile(join(f.dir,'README.md'),'utf8'),f.contents[2]);
  await assert.rejects(readFile(f.summaryPath),{code:'ENOENT'});
});

test('authenticated API check still runs twice for identical data and refuses public-only access',async t=>{
  const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;});
  const calls=[];
  let scope='read:user';
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/user')) return new Response(JSON.stringify({login:'mor4ee'}),{headers:{'x-oauth-scopes':scope}});
    const to=JSON.parse(options.body).variables.to;
    const start=Date.parse(`${to.slice(0,4)}-01-01T00:00:00Z`);
    const days=Array.from({length:Math.floor((Date.parse(to)-start)/86400000)+1},(_,i)=>({date:new Date(start+i*86400000).toISOString().slice(0,10),contributionCount:i===0?1:0}));
    return new Response(JSON.stringify({data:{viewer:{login:'mor4ee',contributionsCollection:{contributionCalendar:{totalContributions:1,weeks:[{contributionDays:days}]}}}}}));
  };
  await fetchSnapshot('test-token'); await fetchSnapshot('test-token');
  assert.equal(calls.length,4);
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-token');
  scope='';
  await assert.rejects(fetchSnapshot('test-token'),/partial public-only/);
  assert.equal(calls.length,5);
});

test('year rollover resets the calendar year and publishes January 1 even with zero activity',async t=>{
  const f=await fixture(t);
  const next={schemaVersion:1,source:'github-profile',year:2027,asOfDate:'2027-01-01',days:[{date:'2027-01-01',count:0}]};
  const result=await refreshPublishedProfile({snapshot:next,fetchedAt:'2027-01-01T00:17:00Z'},f.options);
  assert.equal(result.changed,true);
  assert.match(result.desktop,/2027-01-01: 0 contributions/);
  assert.doesNotMatch(result.desktop,/data-date="2026-/);
  assert.match(result.readme,/updated 1 Jan 2027, 00:17 UTC/);
});

test('currently published desktop/mobile artwork is already a stable render',async()=>{
  const root=new URL('../',import.meta.url);
  const [desktop,mobile,readme]=await Promise.all(paths.map(path=>readFile(new URL(path,root),'utf8')));
  const asOfDate=desktop.match(/snapshot cutoff (\d{4}-\d{2}-\d{2})/)[1];
  const counts=new Map([...desktop.matchAll(/<title>(\d{4}-\d{2}-\d{2}): (\d+) contributions<\/title>/g)].map(([,date,count])=>[date,Number(count)]));
  const year=Number(asOfDate.slice(0,4));
  // Historical values outside the 26-week viewport do not affect this render.
  const start=Date.parse(`${year}-01-01T00:00:00Z`);
  const days=Array.from({length:(Date.parse(asOfDate)-start)/86400000+1},(_,i)=>{
    const date=new Date(start+i*86400000).toISOString().slice(0,10);
    return {date,count:counts.get(date)??0};
  });
  const {planRefresh}=await import('../scripts/refresh-published-profile.mjs');
  const result=await planRefresh({desktop,mobile,readme},{schemaVersion:1,source:'github-profile',year,asOfDate,days},`${asOfDate}T23:59:59Z`);
  assert.equal(result.changed,false);
  assert.equal(result.readme,readme);
});
