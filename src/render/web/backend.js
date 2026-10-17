mergeInto(LibraryManager.library, {
  $SWGPU__postset: 'SWGPU.devices = new Map(); Module.releaseRenderers = () => { for (const id of [...SWGPU.devices.keys()]) SWGPU.close(id); };',
  $SWGPU: {
    next: 1,
    devices: null,
    get(id) { const device = SWGPU.devices.get(id); if (!device) throw new Error('Invalid renderer owner'); return device; },
    failure(error) { Module.printErr(error.stack || String(error)); (Module.renderErrors ||= []).push(String(error)); return 0; },
    releaseCommands(s) { for (const b of s.temporary || []) b.destroy(); s.temporary = []; s.reads = []; },
    buffer(s, bytes, usage) { return s.device.createBuffer({size: bytes, usage}); },
    close(id) {
      const s=SWGPU.get(id); s.closed=true;
      s.context?.unconfigure(); SWGPU.releaseCommands(s);
      for(const buffer of s.buffers.values()) buffer.destroy();
      s.device.destroy(); SWGPU.devices.delete(id);
    },
  },
  web_open__deps: ['$SWGPU', '$Asyncify'],
  web_open: () => Asyncify.handleAsync(async () => {
    try {
      if (!navigator.gpu) throw new Error('WebGPU requires a supported browser and a secure context');
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter');
      if (!adapter.features.has('timestamp-query')) throw new Error('Renderer requires WebGPU timestamp queries');
      const device = await adapter.requestDevice({requiredFeatures:['timestamp-query'], requiredLimits:{
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
        maxComputeWorkgroupsPerDimension: 65535,
      }});
      const s = {device, buffers:new Map(), next:1, pipelines:[], temporary:[], reads:[], error:null};
      device.addEventListener('uncapturederror', event => { s.error = event.error; SWGPU.failure(event.error); });
      device.lost.then(info => { if (!s.closed) { s.error = new Error('WebGPU device lost: '+info.message); SWGPU.failure(s.error); } });
      const id = SWGPU.next++; SWGPU.devices.set(id, s); return id;
    } catch(error) { return SWGPU.failure(error); }
  }),
  web_limit__deps: ['$SWGPU'], web_limit: id => Math.min(SWGPU.get(id).device.limits.maxStorageBufferBindingSize, 0xffffffff),
  web_close__deps: ['$SWGPU'], web_close: id => SWGPU.close(id),
  web_buffer__deps: ['$SWGPU', '$Asyncify'],
  web_buffer: (id, size) => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id); let b;
    try {
      s.device.pushErrorScope('out-of-memory'); s.device.pushErrorScope('validation');
      b=SWGPU.buffer(s, size>>>0, GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
      const validation=await s.device.popErrorScope(), memory=await s.device.popErrorScope();
      if(validation||memory) throw validation||memory;
      const handle=s.next++; s.buffers.set(handle,b); return handle;
    } catch(error) { b?.destroy(); return SWGPU.failure(error); }
  }),
  web_buffer_close__deps: ['$SWGPU'], web_buffer_close: (id, handle) => { const s=SWGPU.get(id); s.buffers.get(handle).destroy(); s.buffers.delete(handle); },
  web_layout__deps: ['$SWGPU'], web_layout: (id, checked) => {
    const s=SWGPU.get(id); s.layout=s.device.createBindGroupLayout({entries:Array.from({length:2+checked},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}))});
    s.pipelineLayout=s.device.createPipelineLayout({bindGroupLayouts:[s.layout]});
    s.indirect=SWGPU.buffer(s,12,GPUBufferUsage.COPY_DST|GPUBufferUsage.INDIRECT);
  },
  web_pipeline__deps: ['$SWGPU', '$Asyncify'], web_pipeline: (id, ptr, size, slot) => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id), code=new TextDecoder().decode(HEAPU8.subarray(ptr>>>0,(ptr>>>0)+size));
    try {
      const module=s.device.createShaderModule({code});
      const report=await module.getCompilationInfo();
      const errors=report.messages.filter(x=>x.type==='error');
      if(errors.length)throw new Error(errors.map(x=>`${x.lineNum}:${x.linePos}: ${x.message}`).join('\n'));
      s.pipelines[slot]=await s.device.createComputePipelineAsync({layout:s.pipelineLayout,compute:{module,entryPoint:'main'}}); return 1;
    }catch(error){return SWGPU.failure(error);}
  }),
  web_bindings__deps: ['$SWGPU'], web_bindings: (id, handle, words, floats, status) => {
    const s=SWGPU.get(id); s.buffer=s.buffers.get(handle);
    const entries=[{binding:0,resource:{buffer:s.buffer,offset:0,size:(words+1)*4}},{binding:1,resource:{buffer:s.buffer,offset:(words+1)*4,size:(floats+1)*4}}];
    if(status)entries.push({binding:2,resource:{buffer:s.buffer,offset:(words+floats+2)*4,size:status*4}});
    s.bindings=s.device.createBindGroup({layout:s.layout,entries});
  },
  web_begin__deps: ['$SWGPU'], web_begin: id => { const s=SWGPU.get(id); SWGPU.releaseCommands(s); s.encoder=s.device.createCommandEncoder(); },
  web_end__deps: ['$SWGPU'], web_end: id => { const s=SWGPU.get(id); s.encoder.resolveQuerySet(s.queries,0,s.queryCount,s.queryResults,0); s.commands=s.encoder.finish(); s.encoder=null; },
  web_bind__deps: ['$SWGPU'], web_bind: (id, slot) => { SWGPU.get(id).pipeline=slot; },
  web_dispatch__deps: ['$SWGPU'], web_dispatch: (id, groups, offset, indirect) => {
    const s=SWGPU.get(id);
    if(indirect)s.encoder.copyBufferToBuffer(s.buffer,offset,s.indirect,0,12);
    const pass=s.encoder.beginComputePass(); pass.setPipeline(s.pipelines[s.pipeline]); pass.setBindGroup(0,s.bindings);
    if(indirect)pass.dispatchWorkgroupsIndirect(s.indirect,0);else if(groups)pass.dispatchWorkgroups(groups);
    pass.end();
  },
  web_clear__deps: ['$SWGPU'], web_clear: (id, offset, size) => { const s=SWGPU.get(id); s.encoder.clearBuffer(s.buffer,offset,size); },
  web_word__deps: ['$SWGPU'], web_word: (id, offset, value) => {
    const s=SWGPU.get(id), b=s.device.createBuffer({size:4,usage:GPUBufferUsage.COPY_SRC,mappedAtCreation:true});
    new Uint32Array(b.getMappedRange())[0]=value; b.unmap(); s.temporary.push(b); s.encoder.copyBufferToBuffer(b,0,s.buffer,offset,4);
  },
  web_transfer__deps: ['$SWGPU'], web_transfer: (id, memory, offset, size, upload) => {
    const s=SWGPU.get(id);
    if(upload) { s.device.queue.writeBuffer(s.buffer,offset,HEAPU8,(memory>>>0)+offset,size); return; }
    const b=SWGPU.buffer(s,size,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    s.encoder.copyBufferToBuffer(s.buffer,offset,b,0,size); s.reads.push({buffer:b,ptr:(memory>>>0)+offset}); s.temporary.push(b);
  },
  web_submit__deps: ['$SWGPU', '$Asyncify'], web_submit: id => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id);
    try {
      s.device.queue.submit([s.commands]); s.commands=null;
      const reads=await Promise.allSettled(s.reads.map(async r=>{await r.buffer.mapAsync(GPUMapMode.READ); HEAPU8.set(new Uint8Array(r.buffer.getMappedRange()),r.ptr);r.buffer.unmap();}));
      await s.device.queue.onSubmittedWorkDone(); if(s.error)throw s.error;
      const failed=reads.find(result=>result.status==='rejected'); if(failed)throw failed.reason;
      SWGPU.releaseCommands(s); return 1;
    }catch(error){return SWGPU.failure(error);}
  }),
  web_present__deps: ['$SWGPU', '$Asyncify'], web_present: (id, offset, width, height) => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id), canvas=Module.canvas;
    try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    if(s.error)throw s.error;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    if(!s.context){s.context=canvas.getContext('webgpu');s.context.configure({device:s.device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});}
    const encoder=s.device.createCommandEncoder(), pitch=Math.ceil(width*4/256)*256;
    let buffer=s.buffer, sourceOffset=offset, packed=null;
    if(pitch!==width*4){packed=SWGPU.buffer(s,pitch*height,GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);for(let y=0;y<height;y++)encoder.copyBufferToBuffer(buffer,offset+y*width*4,packed,y*pitch,width*4);buffer=packed;sourceOffset=0;}
    encoder.copyBufferToTexture({buffer,offset:sourceOffset,bytesPerRow:pitch,rowsPerImage:height},{texture:s.context.getCurrentTexture()},[width,height]);
    s.device.queue.submit([encoder.finish()]); if(packed)packed.destroy(); return 1;
    } catch(error) {return SWGPU.failure(error);}
  }),
  web_queries__deps: ['$SWGPU'], web_queries: (id, count) => { const s=SWGPU.get(id); s.queryCount=count;s.queries=s.device.createQuerySet({type:'timestamp',count});s.queryResults=SWGPU.buffer(s,count*8,GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC);return 1; },
  web_stamp__deps: ['$SWGPU'], web_stamp: (id, index) => { const s=SWGPU.get(id); const pass=s.encoder.beginComputePass({timestampWrites:{querySet:s.queries,beginningOfPassWriteIndex:index}});pass.end(); },
  web_times__deps: ['$SWGPU', '$Asyncify'], web_times: (id, ptr) => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id), b=SWGPU.buffer(s,s.queryCount*8,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    try { const encoder=s.device.createCommandEncoder();encoder.copyBufferToBuffer(s.queryResults,0,b,0,s.queryCount*8);s.device.queue.submit([encoder.finish()]);await b.mapAsync(GPUMapMode.READ);HEAPU8.set(new Uint8Array(b.getMappedRange()),ptr>>>0);b.unmap();return 1; }
    catch(error){return SWGPU.failure(error);} finally{b.destroy();}
  }),
  web_now: () => BigInt(Math.round(performance.now() * 1000000)),
});
