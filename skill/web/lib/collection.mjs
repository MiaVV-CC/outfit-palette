export function localDate(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function filterLooks(records,filters={}){
  return records.filter(record=>(!filters.weather||record.tags.weather===filters.weather)&&(!filters.occasion||record.tags.occasion===filters.occasion)&&(!filters.mood||record.tags.moods.includes(filters.mood)));
}
export function chooseLook(records,query,excluded=[],today=localDate()){
  const day=value=>Date.parse(value+'T00:00:00Z')/86400000;
  const ranked=records.map(record=>{
    const matches=[record.tags.weather===query.weather,record.tags.occasion===query.occasion,!query.mood||record.tags.moods.includes(query.mood)];
    const last=[...record.wornDates].sort().at(-1);
    const recent=last&&day(today)-day(last)>=0&&day(today)-day(last)<3;
    return {record,exact:matches.every(Boolean),score:matches.filter(Boolean).length,recent:Boolean(recent)};
  }).sort((a,b)=>Number(b.exact)-Number(a.exact)||b.score-a.score||Number(a.recent)-Number(b.recent)||a.record.id.localeCompare(b.record.id));
  if(!ranked.length)return null;
  const best=ranked[0],pool=ranked.filter(r=>r.exact===best.exact&&r.score===best.score);
  return pool.find(r=>!excluded.includes(r.record.id))||pool[0];
}
