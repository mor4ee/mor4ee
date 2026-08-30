import {calendarModel} from './calendar.mjs';

// Project only the authorized daily aggregates; never persist the raw response.
export function profileSnapshot(response, fetchedAt) {
  if (typeof fetchedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(fetchedAt) || !Number.isFinite(Date.parse(fetchedAt))) throw new Error('Invalid fetch timestamp');
  if (response?.errors?.length) throw new Error('GraphQL returned errors; snapshot rejected');
  const user=response?.data?.viewer;
  if(user?.login!=='mor4ee') throw new Error('Expected authenticated owner mor4ee');
  const calendar=user.contributionsCollection?.contributionCalendar;
  if(!Array.isArray(calendar?.weeks)) throw new Error('Calendar missing');
  const input={schemaVersion:1,source:'github-profile',year:Number(fetchedAt.slice(0,4)),asOfDate:fetchedAt.slice(0,10),
    days:calendar.weeks.flatMap(week=>{
      if(!Array.isArray(week.contributionDays)) throw new Error('Daily records missing');
      return week.contributionDays.map(day=>({date:day.date,count:day.contributionCount}));
    })};
  const model=calendarModel(input);
  if(model.coverage.unknown!==0) throw new Error('Incomplete API coverage; do not zero-fill missing days');
  if(!Number.isSafeInteger(calendar.totalContributions) || calendar.totalContributions!==model.knownTotal) throw new Error('API total and daily counts disagree');
  return input;
}
