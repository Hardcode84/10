import {quantiles} from './frame-trace.mjs';
const header = 'frame timestamps: start prediction_start prediction_finish submitted finish\n';
if (process.argv.length < 3) throw Error('Supply logs from crust tests.crs tasks');
for (const path of process.argv.slice(2)) {
  const log = await Bun.file(path).text();
  if (!log.includes(header)) throw Error(`Missing frame timings: ${path}`);
  const words = log.split(header)[1].split('\n').slice(0, 400);
  if (words.length !== 400 || words.some(x => !/^\d+$/.test(x))) throw Error(`Incomplete timings: ${path}`);
  const values = words.map(Number), metrics = {frame:[], prediction:[], beforeSubmit:[], predictionAfterSubmit:[]};
  if (values.some(x => !Number.isSafeInteger(x))) throw Error(`Timestamp exceeds exact integer range: ${path}`);
  for (let i=0; i<80; i++) {
    const [start, a, b, submitted, finish] = values.slice(i*5,i*5+5);
    if (a<start || b<a || finish<b || submitted<start || finish<submitted) throw Error(`Invalid timestamps: ${path}, frame ${i}`);
    if (i<16)continue;
    metrics.frame.push((finish-start)/1e6);
    metrics.prediction.push((b-a)/1e6);
    metrics.beforeSubmit.push((submitted-start)/1e6);
    metrics.predictionAfterSubmit.push(Math.max(0,b-Math.max(a,submitted))/1e6);
  }
  console.log(JSON.stringify({path,milliseconds:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,quantiles(v)]))},null,2));
}
