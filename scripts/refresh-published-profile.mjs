import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {profileSnapshot} from '../src/widgets/github-profile.mjs';
import {renderCurrentCalendar} from './render-current-calendar.mjs';

export async function refreshedProfile(svg,snapshot) {
  const fontBase64=svg.match(/font-family:CurrentMono;src:url\(data:font\/woff2;base64,([^)]*)\)/)?.[1];
  if(!fontBase64) throw new Error('Calendar font missing');
  const region=/<!-- CALENDAR_START -->([\s\S]*?)<!-- CALENDAR_END -->/g;
  const matches=[...svg.matchAll(region)];
  if(matches.length!==1) throw new Error('Expected exactly one calendar region');
  const root=matches[0][1].match(/^<svg\b[^>]*>/)?.[0];
  if(!root) throw new Error('Calendar root missing');
  const calendar=await renderCurrentCalendar(snapshot,{fontBase64});
  const updated=calendar.replace(/^<svg\b[^>]*>/,root);
  return svg.replace(region,`<!-- CALENDAR_START -->${updated}<!-- CALENDAR_END -->`)
    .replace(/Snapshot through \d{4}-\d{2}-\d{2}; aggregate counts only\./,`Snapshot through ${snapshot.asOfDate}; aggregate counts only.`);
}

export async function fetchSnapshot(token) {
  if(!token) throw new Error('Add the PROFILE_TOKEN Actions secret with read:user permission');
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'mor4ee-profile-calendar'};
  const owner=await fetch('https://api.github.com/user',{headers,signal:AbortSignal.timeout(30000)});
  if(!owner.ok) throw new Error(`Owner check failed (${owner.status}); existing image retained`);
  const scopes=(owner.headers.get('x-oauth-scopes')??'').split(',').map(s=>s.trim());
  if(!scopes.includes('read:user')&&!scopes.includes('user')) throw new Error('read:user scope required; refusing a partial public-only calendar');
  if((await owner.json()).login!=='mor4ee') throw new Error('Expected owner mor4ee');
  const fetchedAt=new Date().toISOString();
  const query='query($from: DateTime!, $to: DateTime!) { viewer { login contributionsCollection(from: $from, to: $to) { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }';
  const response=await fetch('https://api.github.com/graphql',{method:'POST',headers,
    body:JSON.stringify({query,variables:{from:`${fetchedAt.slice(0,4)}-01-01T00:00:00Z`,to:fetchedAt}}),signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`Calendar request failed (${response.status}); existing image retained`);
  return {snapshot:profileSnapshot(await response.json(),fetchedAt),fetchedAt};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const {snapshot,fetchedAt}=await fetchSnapshot(process.env.PROFILE_TOKEN);
  // Validate and render everything before writing; failed jobs never commit files.
  const results=[];
  for(const name of ['profile.svg','profile.mobile.svg']) {
    const path=new URL(`../assets/${name}`,import.meta.url);
    results.push([path,await refreshedProfile(await readFile(path,'utf8'),snapshot)]);
  }
  const path=new URL('../README.md',import.meta.url);
  const readme=await readFile(path,'utf8');
  const marker=/<!-- CALENDAR_METADATA_START -->[\s\S]*?<!-- CALENDAR_METADATA_END -->/g;
  if([...readme.matchAll(marker)].length!==1) throw new Error('README calendar metadata missing');
  results.push([path,readme.replace(marker,`<!-- CALENDAR_METADATA_START -->\nCalendar snapshot through **${snapshot.asOfDate}**. Last successful fetch: **${fetchedAt}**.\n<!-- CALENDAR_METADATA_END -->`)]);
  for(const [file,content] of results) await writeFile(file,content);
  console.log('Updated desktop/mobile calendar and successful-fetch timestamp. Dates/counts only.');
}
