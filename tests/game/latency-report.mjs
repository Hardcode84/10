import {readFrameTrace, quantiles} from "./frame-trace.mjs";
// Usage: bun tests/game/latency-report.mjs trace.swlt producer.txt
const [tracePath, producerPath] = process.argv.slice(2);
if (!tracePath || !producerPath) throw new Error('expected trace and producer log');
const {events, ...metadata} = await readFrameTrace(tracePath);
const text = await Bun.file(producerPath).text();
const rows = text.split('input availability and timer jitter ns\n')[1]?.trim().split('\n');
if (!rows || rows.length !== 64) throw new Error('expected 32 producer samples');
const inputs = events.filter(e => e.kind === 1);
if (inputs.length === 33 && inputs.at(-1).value === 41) inputs.pop();
if (inputs.length !== 32 || inputs.some(e => e.value !== 15)) throw new Error('missing or extra input events');
const ticks = events.filter(e => e.kind === 2);
const submissions = events.filter(e => e.kind === 3);
const presents = new Map(events.filter(e => e.kind === 4).map(e => [e.value, e]));
const measures = {jitter: [], poll: [], simulation: [], submission: [], presentation: [], simulationToSubmission: [], simulationToPresentation: []};
const phases = new Set();
const ms = value => Number(value) / 1e6;
for (let i = 0; i < inputs.length; i++) {
  const queued = BigInt(rows[2 * i]), jitter = BigInt(rows[2 * i + 1]), input = inputs[i];
  const tick = ticks.find(e => e.sequence >= input.sequence);
  if (!tick || tick.sequence !== input.sequence || tick.value !== 1) throw new Error(`input ${i} lost or coalesced`);
  const frame = submissions.find(e => e.tick >= tick.tick && e.sequence >= input.sequence && presents.has(e.value));
  if (!frame) throw new Error(`no presented snapshot for input ${i}`);
  const present = presents.get(frame.value);
  if (jitter < 0n || queued > input.time || input.time > tick.time || tick.time > frame.time || frame.time > present.time)
    throw new Error(`invalid clock or snapshot order for input ${i}`);
  const prior = submissions.filter(e => e.time <= queued).at(-1);
  const next = submissions.find(e => e.time > queued);
  if (prior && next) phases.add(Math.min(3, Number((queued - prior.time) * 4n / (next.time - prior.time))));
  measures.jitter.push(ms(jitter));
  measures.poll.push(ms(input.time - queued));
  measures.simulation.push(ms(tick.time - queued));
  measures.submission.push(ms(frame.time - queued));
  measures.presentation.push(ms(present.time - queued));
  measures.simulationToSubmission.push(ms(frame.time - tick.time));
  measures.simulationToPresentation.push(ms(present.time - tick.time));
}
measures.submissionInterval = [];
const firstInput = BigInt(rows[0]), lastInput = BigInt(rows[62]);
for (let i = 1; i < submissions.length; i++) {
  const before = submissions[i - 1], after = submissions[i];
  if (before.time >= firstInput && after.time <= lastInput)
    measures.submissionInterval.push(ms(after.time - before.time));
}
measures.presentationInterval = [];
const outputs = [...presents.values()];
for (let i = 1; i < outputs.length; i++) {
  const before = outputs[i - 1], after = outputs[i];
  if (before.time >= firstInput && after.time <= lastInput)
    measures.presentationInterval.push(ms(after.time - before.time));
}
const summary = {};
for (const [name, samples] of Object.entries(measures)) {
  summary[name] = quantiles(samples);
}
let zeroTickFrames = 0, multiTickFrames = 0;
for (let i = 1; i < submissions.length; i++) {
  const delta = submissions[i].tick - submissions[i - 1].tick;
  if (delta === 0) zeroTickFrames++;
  if (delta > 1) multiTickFrames++;
}
if (phases.size < 3) throw new Error('insufficient input arrival phase coverage');
console.log(JSON.stringify({...metadata, samples: inputs.length, arrivalQuartiles: [...phases].sort(), ticks: ticks.length,
  frames: submissions.length, zeroTickFrames, multiTickFrames, milliseconds: summary}, null, 2));
