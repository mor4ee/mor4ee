import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {calendarModel} from '../src/widgets/calendar.mjs';
import {calendarPartialDemo} from '../src/data/calendar.demo.mjs';
const require=createRequire(import.meta.url);

// Twenty-six calendar weeks ending in the snapshot week, not a shrunken annual card.
export async function renderCurrentCalendar(input=calendarPartialDemo,{fontBase64}={}) {
  const model=calendarModel(input);
  const cutoff=model.days.find(day=>day.date===model.asOfDate);
  if(!cutoff) throw new Error('Current snapshot cutoff must be within its calendar year');
  const end=cutoff.column;
  const first=Math.max(0,end-25);
  const weeks=end-first+1;
  const days=model.days.filter(day=>day.column>=first && day.column<=end);
  const isDemo=model.source==='demo';
  const title=isDemo?'Recent activity calendar — DEMO':'Profile activity — GitHub snapshot';
  const scope=isDemo?'Synthetic data, not Flexbar or mor4ee activity.':'GitHub profile contributions, including private activity available to the authenticated owner. Dates and counts only; not Flexbar-only activity. Counts are contributions, not just commits. Cutoff day may be incomplete; this is a saved snapshot, not a live feed.';
  const colors=['#332619','#704620','#a86124','#cf761d','#ec7e11'];
  const font=fontBase64??(await readFile(require.resolve('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'))).toString('base64');
  const cells=days.map(day=>{
    const x=(day.column-first)*10,y=day.row*9;
    const level=day.count===0?0:day.count<4?1:day.count<8?2:day.count<16?3:4;
    return `<g data-date="${day.date}" data-state="${day.state}"><title>${day.date}: ${day.state==='known'?`${day.count} ${isDemo?'demo units':'contributions'}`:day.state}</title><rect x="${x}" y="${y}" width="7" height="7" fill="${day.state==='known'?colors[level]:'#080d0f'}" stroke="${day.state==='known'?'none':day.state==='unknown'?'#e0d6c9':'#46515b'}"/>${day.state==='unknown'?`<path d="M${x+1} ${y+6}L${x+6} ${y+1}" stroke="#e0d6c9"/>`:''}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 258 82" width="258" height="82" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${weeks} calendar weeks from ${days[0].date} through ${days.at(-1).date}; snapshot cutoff ${model.asOfDate}. ${scope} Intensity bins: 0, 1–3, 4–7, 8–15, 16+. Slashed cells are missing; outlined cells are after cutoff.</desc><defs><style>@font-face{font-family:CurrentMono;src:url(data:font/woff2;base64,${font}) format('woff2')}text{font-family:CurrentMono,monospace;font-size:10px;fill:#e0d6c9}</style></defs>${cells}<text x="0" y="78">${days[0].date.slice(5)} — ${model.asOfDate.slice(5)} / ${weeks} wk${isDemo?' · demo':''}</text></svg>`;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  await writeFile(new URL('../public/exports/current-calendar.recent.demo.svg',import.meta.url),await renderCurrentCalendar());
  console.log('Exported compact Current calendar, 26 calendar weeks.');
}
