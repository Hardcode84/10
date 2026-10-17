import {readFrameTrace, quantiles} from './frame-trace.mjs';
// Usage: bun tests/game/presentation-report.mjs build/presentation.swlt
for (const path of process.argv.slice(2)) {
  const {events, ...metadata} = await readFrameTrace(path);
  const frames = new Map();
  for (const event of events.filter(e => e.kind >= 3)) {
    if (!frames.has(event.value)) frames.set(event.value, new Map());
    const frame = frames.get(event.value);
    if (frame.has(event.kind)) throw Error('duplicate frame event');
    frame.set(event.kind, event.time);
  }
  const pairs = {submitToFence: [3, 5], completionToValidation: [5, 6],
    presentationDispatch: [6, 7], acquireAndCopy: [7, 4],
    presentationDrain: [4, 8], releaseDelivery: [8, 9], submitToRelease: [3, 9]};
  const measures = Object.fromEntries(Object.keys(pairs).map(name => [name, []]));
  measures.presentationInterval = [];
  let previous;
  for (const [id, frame] of frames) {
    const order = [3, 5, 6, 7, 4, 8, 9].map(kind => frame.get(kind));
    if (order.some((t, i) => t === undefined || (i && t < order[i - 1])))
      throw Error(`invalid native output order in frame ${id}`);
    if (id > 16) {
      for (const [name, [a, b]] of Object.entries(pairs)) measures[name].push(Number(frame.get(b) - frame.get(a)) / 1e6);
      if (previous) measures.presentationInterval.push(Number(frame.get(4) - previous.get(4)) / 1e6);
    }
    previous = frame;
  }
  if (frames.size !== 128) throw Error('expected 128 presented frames');
  console.log(JSON.stringify({path, ...metadata, measuredFrames: 112,
    milliseconds: Object.fromEntries(Object.entries(measures).map(([key, values]) => [key, quantiles(values)]))}, null, 2));
}
