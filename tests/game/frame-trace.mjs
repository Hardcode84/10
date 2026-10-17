export async function readFrameTrace(path) {
  const bytes = await Bun.file(path).arrayBuffer();
  const view = new DataView(bytes);
  const word = offset => view.getUint32(offset, true);
  if (bytes.byteLength < 32 || word(0) !== 0x53574c54 || word(4) !== 1 || word(8) !== 24 || bytes.byteLength !== 32 + word(12) * 24)
    throw new Error('invalid latency trace');
  const events = [];
  for (let offset = 32; offset < bytes.byteLength; offset += 24)
    events.push({kind: word(offset), sequence: word(offset + 4), tick: word(offset + 8),
      value: word(offset + 12), time: view.getBigUint64(offset + 16, true)});
  return {events, mode: word(16) ? 'tasks' : 'serial', width: word(20), height: word(24), roomDemo: !!word(28)};
}
export function quantiles(samples) {
  if (!samples.length) throw Error('no measured samples');
  const sorted = [...samples].sort((a, b) => a - b);
  return Object.fromEntries([50, 95, 99].map(p => [`p${p}`, sorted[Math.ceil(sorted.length * p / 100) - 1]]));
}
