// Run against tools/web/serve.mjs and a browser with remote debugging enabled.
async function measure(tasks) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async test => {
    const deadline = performance.now() + 30000;
    while (!test()) {
      if (performance.now() > deadline) throw Error(document.querySelector('#log').textContent);
      await wait(10);
    }
  };
  await until(() => !document.querySelector('#start').disabled);
  const form = document.querySelector('#setup');
  for (const [name, value] of Object.entries({seed: 1, complexity: 3, width: 640, height: 480, ticks: 0})) form.elements[name].value = value;
  form.elements.capture.checked = false;
  form.elements.record.checked = false;
  const call = spinward.ccall;
  spinward.ccall = async function(name, type, types, values, settings) {
    if (name !== 'main') return call(name, type, types, values, settings);
    const extra = ['--latency-log', '/latency.swlt', ...(tasks ? ['--tasks'] : ['--serial'])].map(s => spinward.stringToNewUTF8(s));
    const [count, original] = values, argv = spinward._malloc((count + extra.length + 1) * 4);
    if (!argv || extra.some(p => !p)) throw Error('Cannot allocate measurement arguments');
    spinward.HEAPU32.set(spinward.HEAPU32.subarray(original >>> 2, (original >>> 2) + count), argv >>> 2);
    spinward.HEAPU32.set([...extra, 0], (argv >>> 2) + count);
    try { return await call(name, type, types, [count + extra.length, argv], settings); }
    finally { spinward._free(argv); extra.forEach(p => spinward._free(p)); }
  };
  let frames = 0;
  const get = GPUCanvasContext.prototype.getCurrentTexture;
  GPUCanvasContext.prototype.getCurrentTexture = function() { frames++; return get.call(this); };
  form.requestSubmit();
  await until(() => frames > 3);
  const samples = [];
  const url = URL.createObjectURL(new Blob([`
    onmessage = e => {
      const start = performance.now() + 500;
      let i = 0;
      function send() {
        const due = start + i * 103.7;
        const delay = due - performance.now();
        if (delay > 0) { setTimeout(send, delay); return; }
        postMessage({jitter: performance.now() - due});
        if (++i < 32) setTimeout(send, Math.max(0, start + i * 103.7 - performance.now()));
        else setTimeout(() => postMessage(null), 500);
      }
      send();
    };`], {type: 'text/javascript'}));
  const worker = new Worker(url);
  try {
    await new Promise((resolve, reject) => {
      worker.onerror = reject;
      worker.onmessage = e => {
        if (!e.data) { resolve(); return; }
        samples.push({...e.data, queued: performance.now()});
        for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type,
          {code: 'KeyL', key: 'l', keyCode: 76, which: 76, bubbles: true}));
      };
      worker.postMessage(null);
    });
  } finally { worker.terminate(); URL.revokeObjectURL(url); }
  document.querySelector('#quit').click();
  await until(() => !document.querySelector('#restart').hidden);
  const data = spinward.FS.readFile('/latency.swlt');
  const ns = value => BigInt(Math.round(value * 1e6)).toString();
  return {trace: btoa(Array.from(data, n => String.fromCharCode(n)).join('')),
    producer: 'input availability and timer jitter ns\n' + samples.flatMap(s => [ns(s.queued), ns(s.jitter)]).join('\n') + '\n',
    status: document.querySelector('#status').textContent};
}
const endpoint = process.env.BROWSER_CDP || 'http://127.0.0.1:9227';
const origin = process.env.GAME_URL || 'http://127.0.0.1:8000';
const pages = await (await fetch(endpoint + '/json')).json();
const page = pages.find(p => p.type === 'page');
if (!page) throw Error('Open a browser tab');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0, loaded;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) { pending.get(message.id)(message); pending.delete(message.id); }
  if (message.method === 'Page.loadEventFired') loaded?.();
};
async function call(method, params = {}) {
  const result = await new Promise(resolve => { pending.set(++id, resolve); socket.send(JSON.stringify({id, method, params})); });
  if (result.error) throw Error(JSON.stringify(result.error));
  return result.result;
}
try {
  await call('Page.enable');
  const load = new Promise(resolve => { loaded = resolve; });
  await call('Page.navigate', {url: origin + '/?latency=' + Date.now()});
  await load;
  await call('Page.bringToFront');
  const tasks = process.argv.includes('--tasks');
  const result = await call('Runtime.evaluate', {expression: `(${measure})(${tasks})`, awaitPromise: true, returnByValue: true, userGesture: true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  const value = result.result.value;
  if (value.status !== 'Run ended.') throw Error(JSON.stringify(value));
  const path = `build/latency-web-${tasks ? 'tasks' : 'serial'}`;
  await Bun.write(path + '.swlt', Buffer.from(value.trace, 'base64'));
  await Bun.write(path + '.txt', value.producer);
  console.log(`Saved ${path}.swlt and .txt`);
} finally { socket.close(); }
