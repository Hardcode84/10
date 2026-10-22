// Exercise opt-in GPU timestamps and retirement through the shipped renderer.
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
async function witness(enabled, early, stall, deferPresent) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    const end = performance.now() + 90000;
    while (!predicate()) {
      if (!document.querySelector('#restart').hidden) throw Error(document.querySelector('#log').textContent);
      if (performance.now() > end) throw Error('GPU profile timed out: ' + document.querySelector('#log').textContent);
      await wait(50);
    }
  };
  await until(() => !document.querySelector('#start').disabled);
  const form = document.querySelector('#setup');
  form.elements.width.value = deferPresent ? 641 : 960; form.elements.height.value = deferPresent ? 359 : 540;
  form.elements.mute.checked = true;
  form.elements['profile-gpu'].checked = enabled;
  let frames = 0;
  const original = GPUCanvasContext.prototype.getCurrentTexture;
  GPUCanvasContext.prototype.getCurrentTexture = function() { frames++; return original.call(this); };
  const originalDone = GPUQueue.prototype.onSubmittedWorkDone;
  const originalSubmit = GPUQueue.prototype.submit;
  let presentationSubmitted = false, completionRequests = 0, presentationSubmissions = 0;
  if (deferPresent) {
    GPUQueue.prototype.submit = function(commands) {
      presentationSubmitted = commands.some(command => command.label === 'presentation');
      if (presentationSubmitted) presentationSubmissions++;
      return originalSubmit.call(this, commands);
    };
    GPUQueue.prototype.onSubmittedWorkDone = function() {
      if (presentationSubmitted) { completionRequests++; return new Promise(() => {}); }
      return originalDone.call(this);
    };
  }
  if (stall) GPUQueue.prototype.onSubmittedWorkDone = function() {
    const done = originalDone.call(this), until = performance.now() + 12;
    while (performance.now() < until) {}
    return done;
  };
  try {
    form.requestSubmit();
    await until(() => enabled && !early ? !!spinward.webGPUProfile : frames >= (early ? 35 : 60));
    document.querySelector('#quit').click();
    const end = performance.now() + 10000;
    while (document.querySelector('#restart').hidden && performance.now() < end) await wait(50);
    if (document.querySelector('#status').textContent !== 'Run ended.') throw Error(document.querySelector('#log').textContent);
    if (spinward.renderErrors?.length) throw Error(spinward.renderErrors.join('\n'));
    const profile = spinward.webGPUProfile;
    if (!enabled && profile) throw Error('Profiling ran without opt-in');
    if (enabled) {
      if (!profile || profile.complete === early) throw Error('Incorrect profile completion state');
      for (const phase of [profile.baseline, profile.timestamps]) {
        if (!phase.submissions) throw Error('Missing profile samples');
        for (const [name, value] of Object.entries(phase)) if (name !== 'submissions') {
          if (!Number.isFinite(value.p50) || value.p50 < 0 || value.p95 < value.p50) throw Error('Invalid counter: ' + name);
        }
      }
      for (const phase of [profile.baseline, profile.timestamps]) {
        for (const name of ['submitCallMs','encodeToSubmitMs','firstYieldMs','microtaskDelayMs','maxEventLoopLagMs','readbackMapMs','readbackCopyMs','observedMs','polls','readbackBytes','readbackBuffers']) {
          if (!phase[name]) throw Error('Missing timeline measurement: ' + name);
        }
        if (phase.observedMs.p50 < phase.retirementMs.p50) throw Error('Retirement observation precedes completion');
        if (!(phase.readbackBytes.p50 > 0 && phase.readbackBuffers.p50 > 0)) throw Error('Missing production readbacks');
      }
      if (profile.timestamps.gpuCommandSpanMs.p50 < profile.timestamps.gpuSpanMs.p50) throw Error('Command timestamps exclude compute');
      if (stall && (profile.baseline.firstYieldMs.p50 < 12 || profile.baseline.microtaskDelayMs.p50 < 12)) throw Error('Injected CPU stall was not measured');
      if (early && profile.idleProbe) throw Error('Idle probe ran before sample collection finished');
      if (!early && (profile.idleProbe?.submissions !== 5 || !profile.idleProbe.queueMs || !profile.idleProbe.readbackMapMs)) throw Error('Missing idle queue control');
      if (!(profile.timestamps.gpuSpanMs.p50 > 0) || !profile.stages.raster || !profile.stages.shade) throw Error('Missing GPU stage measurements');
    }
    if (deferPresent && presentationSubmissions < 60) throw Error("Presentation submission witness did not run");
    if (deferPresent && completionRequests) throw Error("Presentation requested CPU completion");
    return {frames, profile};
  } finally { GPUCanvasContext.prototype.getCurrentTexture = original; GPUQueue.prototype.onSubmittedWorkDone = originalDone; GPUQueue.prototype.submit = originalSubmit; }
}
const timeout = setTimeout(() => { console.error('GPU profile check timed out'); process.exitCode = 1; socket.close(); }, 120000);
try {
  await call('Page.navigate', {url: origin + '/?profile-check=' + Date.now()});
  await Bun.sleep(1500);
  await call('Page.bringToFront');
  const result = await call('Runtime.evaluate', {expression: `(${witness})(${!process.argv.includes("--disabled")}, ${process.argv.includes("--early-exit")}, ${process.argv.includes("--stall")}, ${process.argv.includes("--defer-present")})`, awaitPromise: true, returnByValue: true, userGesture: true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value, null, 2));
} finally { clearTimeout(timeout); await call('Page.navigate', {url: 'about:blank'}); socket.close(); }
