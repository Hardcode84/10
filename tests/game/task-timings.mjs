// Compare the same command indices across the serial and pipelined flight runs.
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
    const order = mode === 'tasks'
      ? [start, prepared, submitted, cpuBegin, cpuEnd, finish]
      : [start, cpuBegin, cpuEnd, prepared, submitted, finish];
    if (order.some((x, n) => n > 0 && x < order[n-1])) throw Error(`Unexpected event order: ${path}, frame ${i}`);
    return {start, cpuBegin, cpuEnd, prepared, submitted, finish};
  });
  const metrics = {
    boundaryToSubmission:[], beforeSimulation:[], simulationAndPrediction:[],
    afterPredictionToSubmission:[], simulationStartToSubmission:[],
    sceneAssembly:[], recordingAndSubmit:[], postPredictionDrain:[], frame:[],
  };
  // Commands 16..78 have a submitted image in both modes. Command 79 has no
  // measured successor frame in task mode. The final capture is outside timing.
  for (let i=16; i<79; i++) {
    const t=frames[i], image=frames[mode === 'tasks' ? i+1 : i];
    metrics.boundaryToSubmission.push(image.submitted-t.start);
    metrics.beforeSimulation.push(t.cpuBegin-t.start);
    metrics.simulationAndPrediction.push(t.cpuEnd-t.cpuBegin);
    metrics.afterPredictionToSubmission.push(image.submitted-t.cpuEnd);
    metrics.simulationStartToSubmission.push(image.submitted-t.cpuBegin);
    metrics.sceneAssembly.push(t.prepared-(mode === 'tasks' ? t.start : t.cpuEnd));
    metrics.recordingAndSubmit.push(t.submitted-t.prepared);
    if (mode === 'tasks') metrics.postPredictionDrain.push(frames[i+1].start-t.cpuEnd);
    metrics.frame.push(t.finish-t.start);
  }
  const milliseconds = samples => {
    if (!samples.length) return null;
    const sorted = [...samples].sort((a,b)=>a-b);
    return Object.fromEntries([['p50',.5],['p95',.95],['p99',.99]].map(([name,p])=>
      [name, Number((sorted[Math.floor(p*(sorted.length-1))]/1e6).toFixed(4))]));
  };
  console.log(JSON.stringify({path, mode, commands:[16,78], milliseconds:
    Object.fromEntries(Object.entries(metrics).map(([name, samples])=>[name,milliseconds(samples)]))}, null, 2));
}
