import {appendFile,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {profileSnapshot} from '../src/widgets/github-profile.mjs';
import {renderCurrentCalendar} from './render-current-calendar.mjs';

export function calendarMetadata(fetchedAt) {
  const date=new Date(fetchedAt);
  if(!Number.isFinite(date.getTime())) throw new Error('Invalid calendar update timestamp');
  const day=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
  const time=date.toISOString().slice(11,16);
  return `<sub>Profile contributions · updated ${day}, ${time} UTC.</sub>`;
}

export function refreshedReadme(readme,fetchedAt) {
  const marker=/<!-- CALENDAR_METADATA_START -->[\s\S]*?<!-- CALENDAR_METADATA_END -->/g;
  if([...readme.matchAll(marker)].length!==1) throw new Error('README calendar metadata missing');
  return readme.replace(marker,`<!-- CALENDAR_METADATA_START -->\n${calendarMetadata(fetchedAt)}\n<!-- CALENDAR_METADATA_END -->`);
}

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

// Compare deterministic renders, including exact counts and cutoff date, before
// touching the publication timestamp. The SVGs themselves are the saved state.
export async function planRefresh({desktop,mobile,readme},snapshot,fetchedAt) {
  // Validate metadata even on a no-op; broken templates must not pass silently.
  const nextReadme=refreshedReadme(readme,fetchedAt);
  const nextDesktop=await refreshedProfile(desktop,snapshot);
  const nextMobile=await refreshedProfile(mobile,snapshot);
  const changed=nextDesktop!==desktop || nextMobile!==mobile;
  return {changed,desktop:nextDesktop,mobile:nextMobile,
    readme:changed?nextReadme:readme};
}

export function refreshSummary({changed},snapshot,fetchedAt) {
  return `### Profile calendar check

- Source checked successfully: ${new Date(fetchedAt).toISOString()}
- Calendar cutoff (UTC): ${snapshot.asOfDate}
- Publication: ${changed?'updated (calendar content or cutoff changed)':'unchanged (published files and update time retained)'}
- Authenticated owner aggregates, including available private activity; dates/counts only.
`;
}

export async function refreshPublishedProfile({snapshot,fetchedAt},
  {root=new URL('../',import.meta.url),summaryPath}={}) {
  const paths=['assets/profile.svg','assets/profile.mobile.svg','README.md'].map(path=>new URL(path,root));
  const [desktop,mobile,readme]=await Promise.all(paths.map(path=>readFile(path,'utf8')));
  // Validate and render everything before writing; failed jobs never commit files.
  const result=await planRefresh({desktop,mobile,readme},snapshot,fetchedAt);
  if(result.changed) {
    for(const [index,content] of [result.desktop,result.mobile,result.readme].entries()) {
      await writeFile(paths[index],content);
    }
  }
  const summary=refreshSummary(result,snapshot,fetchedAt);
  if(summaryPath) await appendFile(summaryPath,summary);
  console.log(summary);
  return result;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  await refreshPublishedProfile(await fetchSnapshot(process.env.PROFILE_TOKEN),
    {summaryPath:process.env.GITHUB_STEP_SUMMARY});
}
