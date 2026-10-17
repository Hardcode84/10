// Exercise the shipped launcher, SDL input, and renderer. Runs inside the browser.
export async function flight(options) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    const deadline = performance.now() + 30000;
    while (!predicate()) {
      if (performance.now() > deadline) throw Error('Browser flight timed out: ' + document.querySelector('#log').textContent);
      await wait(10);
    }
  };
  await until(() => !document.querySelector('#start').disabled);
  const form = document.querySelector('#setup');
  let device;
  if (options.deviceLoss) {
    const request = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function(...args) {
      device = await request.apply(this,args); return device;
    };
  }
  Object.assign(form.elements.seed, {value: '42'});
  for (const [name, value] of Object.entries({complexity: 2, width: 641, height: 359, ticks: options.controls ? 0 : 1})) form.elements[name].value = value;
  form.elements.record.checked = !options.replay;
  form.elements.capture.checked = !options.controls;
  form.elements.fullscreen.checked = !!options.fullscreen;
  form.elements['debug-shaders'].checked = !!options.checked;
  if (options.replay) {
    const data = Uint8Array.from(atob(options.replay), c => c.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([data], 'flight.swr'));
    form.elements.replay.files = transfer.files;
    form.elements.replay.dispatchEvent(new Event('change'));
    await until(() => !document.querySelector('#start').disabled);
    form.elements.ticks.value = 0;
  }
  let frames = 0;
  const getTexture = GPUCanvasContext.prototype.getCurrentTexture;
  GPUCanvasContext.prototype.getCurrentTexture = function() { frames++; return getTexture.call(this); };
  const key = (type, code, key, n) => window.dispatchEvent(new KeyboardEvent(type, {code, key, keyCode:n, which:n, bubbles:true}));
  if (options.tasks) {
    const call = spinward.ccall;
    spinward.ccall = async function(name, type, types, values, settings) {
      if (name !== 'main') return call(name, type, types, values, settings);
      const [count, original] = values, argument = spinward.stringToNewUTF8('--tasks');
      const argv = spinward._malloc((count + 2) * 4);
      if (!argument || !argv) throw Error('Cannot allocate task-mode arguments');
      spinward.HEAPU32.set(spinward.HEAPU32.subarray(original >>> 2, (original >>> 2) + count), argv >>> 2);
      spinward.HEAPU32[(argv >>> 2) + count] = argument;
      spinward.HEAPU32[(argv >>> 2) + count + 1] = 0;
      try { return await call(name, type, types, [count + 1, argv], settings); }
      finally { spinward._free(argv); spinward._free(argument); }
    };
  }
  form.requestSubmit();
  const inputFrame = async () => {
    const target = frames + 2;
    await until(() => frames >= target || !document.querySelector("#restart").hidden);
    if (!document.querySelector("#restart").hidden) throw Error("Game ended before input was consumed");
  };
  let fullscreen = false, paused = false;
  if (options.deviceLoss) {
    await until(() => frames > 0);
    device.destroy();
  } else if (options.hidden) {
    await until(() => frames > 0);
    const request = window.requestAnimationFrame;
    let waiting = false;
    window.requestAnimationFrame = () => { waiting = true; return 0; };
    await until(() => waiting);
    Object.defineProperty(document, 'hidden', {configurable:true, get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
    document.querySelector('#quit').click();
    await until(() => !document.querySelector('#restart').hidden);
    delete document.hidden;
    window.requestAnimationFrame = request;
  } else if (options.controls) {
    await until(() => frames > 0 || !document.querySelector('#restart').hidden);
    fullscreen = !!document.fullscreenElement;
    key('keydown', 'KeyW', 'w', 87);
    key('keydown', 'KeyQ', 'q', 81);
    canvas.dispatchEvent(new MouseEvent('mousedown', {button:0, buttons:1, bubbles:true, clientX:320, clientY:180}));
    await inputFrame(); key('keyup', 'KeyQ', 'q', 81); key('keydown', 'KeyR', 'r', 82);
    await inputFrame(); key('keyup', 'KeyR', 'r', 82);
    canvas.dispatchEvent(new MouseEvent('mousedown', {button:2, buttons:3, bubbles:true}));
    await inputFrame();
    canvas.dispatchEvent(new MouseEvent('mouseup', {button:0, buttons:2, bubbles:true}));
    canvas.dispatchEvent(new MouseEvent('mouseup', {button:2, buttons:0, bubbles:true}));
    key('keyup', 'KeyW', 'w', 87);
    key('keydown', 'KeyF', 'f', 70); await inputFrame(); key('keyup', 'KeyF', 'f', 70);
    key('keydown', 'Tab', 'Tab', 9); await inputFrame(); key('keyup', 'Tab', 'Tab', 9);
    await inputFrame(); const before = spinward.FS.stat('/flight.swr').size;
    await wait(400); paused = spinward.FS.stat('/flight.swr').size === before;
    key('keydown', 'Tab', 'Tab', 9); await inputFrame(); key('keyup', 'Tab', 'Tab', 9);
    await inputFrame();
    document.querySelector('#quit').click();
  }
  await until(() => !document.querySelector('#restart').hidden);
  const encode = path => {
    if (!spinward.FS.analyzePath(path).exists) return null;
    const bytes = spinward.FS.readFile(path); let text = '';
    for (let i=0; i<bytes.length; i+=16384) text += String.fromCharCode(...bytes.subarray(i,i+16384));
    return btoa(text);
  };
  return {status:document.querySelector('#status').textContent, log:document.querySelector('#log').textContent,
    errors:spinward.renderErrors || [], frames, fullscreen, paused,
    recording:encode('/flight.swr'), capture:encode('/capture.ppm')};
}
