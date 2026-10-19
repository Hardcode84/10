// Compare commands rendered in the same iteration in both execution modes.
// Usage: bun tests/game/task-timings.mjs build/serial.txt build/tasks.txt
const header = 'frame timestamps: start cpu_begin cpu_end prepared submitted finish\n';
if (process.argv.length < 3) throw Error('Supply logs from crust tests.crs tasks');
for (const path of process.argv.slice(2)) {
  const log = await Bun.file(path).text();
  const mode = /frame timing mode: (tasks|serial)/.exec(log)?.[1];
  if (!mode || !log.includes(header)) throw Error(`Missing frame timings: ${path}`);
  const words = log.split(header)[1].split('\n').slice(0, 480);
  if (words.length !== 480 || words.some(x => !/^\d+$/.test(x))) throw Error(`Incomplete timings: ${path}`);
  const values = words.map(Number);
  if (values.some(x => !Number.isSafeInteger(x))) throw Error(`Timestamp exceeds exact integer range: ${path}`);
  const frames = Array.from({length:80}, (_, i) => {
    const [start, cpuBegin, cpuEnd, prepared, submitted, finish] = values.slice(i*6, i*6+6);
    const order = mode === 'tasks' ? [start, cpuBegin, prepared, submitted, finish]
      : [start, cpuBegin, cpuEnd, prepared, submitted, finish];
    if (cpuEnd < cpuBegin || cpuEnd > finish) throw Error(`Invalid prediction join: ${path}, frame ${i}`);
    if (order.some((x, n) => n > 0 && x < order[n-1])) throw Error(`Unexpected event order: ${path}, frame ${i}`);
    return {start, cpuBegin, cpuEnd, prepared, submitted, finish};
  });
  const metrics = {
    boundaryToSubmission:[], beforeSimulation:[], simulationAndPrediction:[],
    simulationStartToSubmission:[],
    recordingAndSubmit:[], afterPredictionToFrameEnd:[], frame:[],
  };
  const overlapHeader = 'prediction overlap timestamps: worker_start worker_finish scene_start scene_finish\n';
  let overlappingFrames = 0;
  if (mode === 'tasks' && log.includes(overlapHeader)) {
    const rows = log.split(overlapHeader)[1].split('\n').slice(0, 320);
    if (rows.length !== 320 || rows.some(x => !/^\d+$/.test(x))) throw Error(`Incomplete overlap timings: ${path}`);
    const spans = rows.map(Number);
    metrics.predictionExecution = [];
    metrics.scenePrefix = [];
    metrics.predictionSceneOverlap = [];
    metrics.predictionJoinDelay = [];
    metrics.predictionAfterSubmission = [];
    for (let i=16; i<80; i++) {
      const [a,b,c,d] = spans.slice(i*4,i*4+4);
      if (![a,b,c,d].every(Number.isSafeInteger) || b<a || d<c) throw Error(`Invalid overlap span: ${path}`);
      const overlap = Math.max(0,Math.min(b,d)-Math.max(a,c));
      overlappingFrames += Number(overlap>0);
      metrics.predictionExecution.push(b-a);
      metrics.scenePrefix.push(d-c);
      metrics.predictionSceneOverlap.push(overlap);
      // Both independent tasks must finish before the prediction join can finish.
      const joined = frames[i].cpuEnd;
      if (joined < Math.max(b,d)) throw Error(`Join precedes task completion: ${path}, frame ${i}`);
      metrics.predictionJoinDelay.push(joined-b);
      metrics.predictionAfterSubmission.push(Math.max(0,b-Math.max(a,frames[i].submitted)));
    }
  }
  for (let i=16; i<80; i++) {
    const t=frames[i], image=frames[i];
    metrics.boundaryToSubmission.push(image.submitted-t.start);
    metrics.beforeSimulation.push(t.cpuBegin-t.start);
    metrics.simulationAndPrediction.push(t.cpuEnd-t.cpuBegin);
    metrics.simulationStartToSubmission.push(image.submitted-t.cpuBegin);
    metrics.recordingAndSubmit.push(t.submitted-t.prepared);
    metrics.afterPredictionToFrameEnd.push(t.finish-t.cpuEnd);
    metrics.frame.push(t.finish-t.start);
  }
  const milliseconds = samples => {
    if (!samples.length) return null;
    const sorted = [...samples].sort((a,b)=>a-b);
    return Object.fromEntries([['p50',.5],['p95',.95],['p99',.99]].map(([name,p])=>
      [name, Number((sorted[Math.floor(p*(sorted.length-1))]/1e6).toFixed(4))]));
  };
  console.log(JSON.stringify({path, mode, commands:[16,79], overlappingFrames, milliseconds:
    Object.fromEntries(Object.entries(metrics).map(([name, samples])=>[name,milliseconds(samples)]))}, null, 2));
}
