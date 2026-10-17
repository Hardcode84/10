// A browser/driver witness with no game, shaders, or WebAssembly.
export async function presentation(frames = 180) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error('No WebGPU adapter');
  const device = await adapter.requestDevice();
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  document.body.replaceChildren(canvas);
  const context = canvas.getContext('webgpu');
  context.configure({device, format:'rgba8unorm'});
  const errors=[];
  device.addEventListener('uncapturederror', event => errors.push(event.error.message));
  try {
    for (let i=0; i<frames; i++) {
      await new Promise(requestAnimationFrame);
      const encoder=device.createCommandEncoder();
      const pass=encoder.beginRenderPass({colorAttachments:[{
        view:context.getCurrentTexture().createView(), clearValue:[0.5,0,0,1], loadOp:'clear', storeOp:'store',
      }]});
      pass.end(); device.queue.submit([encoder.finish()]);
    }
    await device.queue.onSubmittedWorkDone();
    if(errors.length) throw Error(errors.join('\n'));
    return {frames, vendor:adapter.info.vendor, architecture:adapter.info.architecture};
  } finally { context.unconfigure(); device.destroy(); }
}
