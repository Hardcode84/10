'use strict';
const form = document.querySelector('#setup');
const canvas = document.querySelector('#canvas');
const start = document.querySelector('#start');
const status = document.querySelector('#status');
const log = document.querySelector('#log');
let game, running = false;
const urls = [];
const loadedFiles = new Map();
function message(text) { log.textContent += String(text) + '\n'; log.scrollTop = log.scrollHeight; }
function fail(error) { status.textContent = String(error.message || error); message(error.stack || error); }
function releaseAudio() {
  const context = game?.SDL3?.audioContext;
  if (!context || context.state === 'closed') return Promise.resolve();
  return context.close();
}
function abort(error) { game?.releaseRenderers(); releaseAudio().catch(fail); fail(error); }
function downloads() {
  const container = document.querySelector('#downloads');
  for (const [path, label, type] of [['/flight.swr','Download recording','application/octet-stream'],['/capture.ppm','Download image','image/x-portable-pixmap']]) {
    if (!game.FS.analyzePath(path).exists) continue;
    const url = URL.createObjectURL(new Blob([game.FS.readFile(path)], {type})); urls.push(url);
    const link = document.createElement('a'); link.href = url; link.download = path.slice(1); link.textContent = label; container.append(link);
  }
}
function finished(code) {
  if (!running) return;
  running = false; releaseAudio().catch(fail); document.exitPointerLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(fail);
  document.querySelector('#restart').hidden = false;
  document.querySelector('#quit').disabled = true;
  status.textContent = code === 0 ? 'Run ended.' : 'Run failed. See the log.';
  downloads();
}
async function run(args) {
  const strings = ['spinward', ...args].map(text => game.stringToNewUTF8(text));
  const argv = game._malloc((strings.length + 1) * 4);
  try {
    if (!argv || strings.some(pointer => !pointer)) throw new Error('Cannot allocate game arguments');
    game.HEAPU32.set([...strings, 0], argv >>> 2);
    const code = await game.ccall('main', 'number', ['number','number'], [strings.length, argv], {async:true});
    finished(code);
  } finally {
    for (const pointer of strings) game._free(pointer);
    game._free(argv);
  }
}
async function prepare() {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable. Use a browser with WebGPU enabled over HTTPS or localhost.');
  game = await Spinward({canvas, noInitialRun:true, print:message, printErr:message, onAbort:abort, onExit:finished});
  window.spinward = game;
  start.disabled = false; start.textContent = 'Start expedition'; status.textContent = 'Ready.';
}
async function importFile(input, path) {
  if (!input.files.length) return false;
  const file = input.files[0], bytes = new Uint8Array(await file.arrayBuffer());
  if (input.files[0] !== file) return false;
  game.FS.writeFile(path, bytes); loadedFiles.set(input.name, file); return true;
}
// Files are loaded before the start gesture so mouse capture can use that gesture.
for (const name of ['replay','bindings']) form.elements[name].addEventListener('change', async () => {
  start.disabled = true;
  try { await importFile(form.elements[name], '/'+name); } catch(error) { fail(error); return; }
  if (name === 'replay') {
    form.elements.record.disabled = form.elements.replay.files.length !== 0;
    if (form.elements.record.disabled) form.elements.record.checked = false;
  }
  start.disabled = ['replay','bindings'].some(name => {
    const selected = form.elements[name].files[0];
    return selected && loadedFiles.get(name) !== selected;
  });
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!game || running) return;
  game.profileGPU = form.elements['profile-gpu'].checked;
  const args = [];
  for (const name of ['seed','complexity','width','height','fov','ticks','volume']) args.push('--'+name, form.elements[name].value);
  for (const name of ['fullscreen','slow','full-spin','headless','scaling','mute']) if(form.elements[name].checked) args.push('--'+name);
  if(form.elements['debug-shaders'].checked) args.push('--debug-shaders','1');
  if(form.elements.record.checked) args.push('--record','/flight.swr');
  if(form.elements.capture.checked) args.push('--capture','/capture.ppm');
  for (const name of ['replay','bindings']) if(form.elements[name].files.length) args.push('--'+name,'/'+name);
  canvas.width=Number(form.elements.width.value); canvas.height=Number(form.elements.height.value);
  document.body.classList.add('playing'); document.querySelector('#toolbar').hidden=false;
  running=true; canvas.focus(); status.textContent='Flying. Tab pauses.';
  run(args).catch(error => { abort(error); finished(1); });
});
document.querySelector('#mouse').onclick = () => { canvas.focus(); canvas.requestPointerLock(); };
document.querySelector('#fullscreen').onclick = () => canvas.requestFullscreen().catch(fail);
document.querySelector('#quit').onclick = () => {
  canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true}));
  canvas.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true}));
};
document.querySelector('#restart').onclick = () => location.reload();
window.addEventListener('beforeunload',()=>{releaseAudio().catch(fail);game?.releaseRenderers();for(const url of urls)URL.revokeObjectURL(url);});
prepare().catch(fail);

const audioStatus = document.querySelector('#audio-status');
const resumeAudio = document.querySelector('#resume-audio');
let watchedAudio;
function updateAudioStatus() {
  const context = game?.SDL3?.audioContext;
  if (context && context !== watchedAudio) {
    watchedAudio = context;
    context.addEventListener('statechange', updateAudioStatus);
  }
  resumeAudio.hidden = !running || !context || context.state === 'running';
  if (!running) { audioStatus.textContent = ''; return; }
  if (form.elements.mute.checked || form.elements.headless.checked || form.elements.capture.checked) {
    audioStatus.textContent = 'Sound off';
  } else if (context) {
    audioStatus.textContent = context.state === 'running' ? 'Sound on' : 'Sound suspended';
  } else {
    audioStatus.textContent = 'Starting sound…';
  }
}
resumeAudio.onclick = async () => {
  try {
    const context = game?.SDL3?.audioContext;
    if (!context) throw new Error('Audio output is unavailable');
    await context.resume();
    updateAudioStatus();
    canvas.focus();
  } catch (error) { fail(error); }
};
setInterval(updateAudioStatus, 250);
