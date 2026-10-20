// Exercises the shipped launcher and captures mixer output without speaker playback.
const endpoint = process.env.BROWSER_CDP || 'http://127.0.0.1:9227';
const origin = process.env.GAME_URL || 'http://127.0.0.1:8000';
const pages = await (await fetch(endpoint + '/json')).json();
const page = pages.find(page => page.type === 'page');
if (!page) throw Error('Open a browser test tab first');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let next = 0;
const pending = new Map();
socket.onmessage = event => {
  const result = JSON.parse(event.data);
  if (result.id) { pending.get(result.id)?.(result); pending.delete(result.id); }
};
async function call(method, params = {}) {
  const result = await new Promise(resolve => {
    pending.set(++next, resolve);
    socket.send(JSON.stringify({id: next, method, params}));
  });
  if (result.error) throw Error(JSON.stringify(result.error));
  return result.result;
}
async function witness() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    const end = performance.now() + 15000;
    while (!predicate()) {
      if (performance.now() > end) throw Error('Audio witness timed out: ' + document.querySelector('#log').textContent);
      await wait(10);
    }
  };
  const require = (condition, message) => { if (!condition) throw Error(message); };
  let context;
  try {
    await until(() => !document.querySelector('#start').disabled);
    const form = document.querySelector('#setup');
    form.elements.width.value = 640; form.elements.height.value = 360;
    form.elements.scaling.checked = true;
    form.requestSubmit();
    await until(() => window.spinward?.SDL3?.audio_playback?.scriptProcessorNode);
    context = spinward.SDL3.audioContext;
    const node = spinward.SDL3.audio_playback.scriptProcessorNode;
    const silent = context.createGain(); silent.gain.value = 0;
    node.disconnect(); node.connect(silent); silent.connect(context.destination);
    await context.resume();
    const original = node.onaudioprocess;
    let calls = 0, peak = 0, latest = 0, gap = 0, previous = 0;
    node.onaudioprocess = event => {
      const time = performance.now();
      if (previous) gap = Math.max(gap, time - previous);
      previous = time;
      original(event);
      latest = 0;
      for (const sample of event.outputBuffer.getChannelData(0)) {
        if (!Number.isFinite(sample) || Math.abs(sample) > 1) throw Error('Invalid mixed sample');
        latest = Math.max(latest, Math.abs(sample));
      }
      peak = Math.max(peak, latest); calls++;
    };
    await until(() => calls >= 3);
    const canvas = document.querySelector('#canvas');
    const key = (type, code, key, value) => window.dispatchEvent(new KeyboardEvent(type, {code, key, keyCode: value, which: value, bubbles: true}));
    canvas.dispatchEvent(new PointerEvent('pointerdown', {pointerType:'mouse', pointerId:1, isPrimary:true, button:0, buttons:1, bubbles:true, clientX:320, clientY:180}));
    await until(() => peak > 0.01);
    await wait(500);
    key('keydown', 'KeyR', 'r', 82); await wait(200); key('keyup', 'KeyR', 'r', 82);
    await wait(300);
    require(latest > 0.001, 'Reel loop produced no PCM');
    key('keydown', 'Tab', 'Tab', 9); await wait(100); key('keyup', 'Tab', 'Tab', 9);
    await wait(400);
    require(latest === 0, 'Paused mixer did not become silent');
    key('keydown', 'Tab', 'Tab', 9); await wait(100); key('keyup', 'Tab', 'Tab', 9);
    await until(() => latest > 0.001);
    const normalGap = gap;
    await context.suspend();
    await until(() => !document.querySelector('#resume-audio').hidden);
    document.querySelector('#resume-audio').click();
    await until(() => context.state === 'running');
    await until(() => document.querySelector('#resume-audio').hidden);
    const before = calls;
    gap = 0; previous = 0;
    await until(() => calls > before + 2);
    const end = performance.now() + 100;
    while (performance.now() < end) { /* Deliberate main-thread stall. */ }
    await until(() => calls > before + 5);
    const result = {calls, peak, normalCallbackGapMs: normalGap, injectedStallGapMs: gap, framesPerCallback: node.bufferSize, sampleRate: context.sampleRate};
    document.querySelector('#quit').click();
    await until(() => !document.querySelector('#restart').hidden);
    require(document.querySelector('#status').textContent === 'Run ended.', document.querySelector('#log').textContent);
    await until(() => context.state === 'closed');
    return result;
  } finally {
    document.querySelector('#quit')?.click();
    if (context && context.state !== 'closed') await context.close();
  }
}
const timeout = setTimeout(() => { console.error('Audio browser check timed out'); process.exitCode = 1; socket.close(); }, 60000);
try {
  await call('Page.navigate', {url: origin + '/?audio-check=' + Date.now()});
  await Bun.sleep(1500);
  await call('Page.bringToFront');
  const result = await call('Runtime.evaluate', {expression: `(${witness})()`, awaitPromise: true, returnByValue: true, userGesture: true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  console.log('Web audio: hook, reel, pause, resume, suspension and close passed', result.result.value);
} finally { clearTimeout(timeout); await call('Page.navigate', {url: 'about:blank'}); socket.close(); }
