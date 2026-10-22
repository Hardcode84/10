mergeInto(LibraryManager.library, {
  $SWGPU__deps: ['$SWGPUProfile'],
  $SWGPU__postset: 'SWGPU.devices = new Map(); Module.releaseRenderers = () => { for (const id of [...SWGPU.devices.keys()]) SWGPU.close(id); };',
  $SWGPU: {
    next: 1,
    devices: null,
    get(id) { const device = SWGPU.devices.get(id); if (!device) throw new Error('Invalid renderer owner'); return device; },
    failure(error) { Module.printErr(error.stack || String(error)); (Module.renderErrors ||= []).push(String(error)); return 0; },
    releaseCommands(s) { s.readCount=0; },
    reserve(s, slot, bytes, usage) {
      if(slot.buffer && slot.capacity>=bytes)return slot.buffer;
      if(bytes>s.device.limits.maxBufferSize)throw new RangeError('WebGPU storage exceeds device buffer limit');
      const capacity=Math.min(s.device.limits.maxBufferSize,Math.max(256,2**Math.ceil(Math.log2(bytes))));
      const buffer=SWGPU.buffer(s,capacity,usage);
      slot.buffer?.destroy(); slot.buffer=buffer; slot.capacity=capacity;
      return buffer;
    },
    closeStorage(s) {
      for(const slot of s.wordChunks)slot.buffer.destroy();
      for(const slot of s.reads)slot.buffer?.destroy();
      s.packed.buffer?.destroy(); s.times.buffer?.destroy();
    },
    buffer(s, bytes, usage) { return s.device.createBuffer({size: bytes, usage}); },
    frameReady() {
      return new Promise(resolve => {
        let frame;
        const finish = visible => {
          cancelAnimationFrame(frame);
          document.removeEventListener('visibilitychange', changed);
          resolve(visible);
        };
        const changed = () => { if (document.hidden) finish(false); };
        document.addEventListener('visibilitychange', changed);
        if (document.hidden) finish(false);
        else frame = requestAnimationFrame(() => finish(!document.hidden));
      });
    },
    close(id) {
      const s=SWGPU.get(id); s.closed=true;
      if(s.profile)SWGPUProfile.close(s);
      s.context?.unconfigure(); SWGPU.closeStorage(s);
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
      const info = adapter.info;
      Module.print('WebGPU adapter: ' + JSON.stringify({
        vendor: info.vendor, architecture: info.architecture,
        device: info.device, description: info.description,
        isFallbackAdapter: info.isFallbackAdapter,
      }));
      if (!adapter.features.has('timestamp-query')) throw new Error('Renderer requires WebGPU timestamp queries');
      const device = await adapter.requestDevice({requiredFeatures:['timestamp-query'], requiredLimits:{
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
        maxComputeWorkgroupsPerDimension: 65535,
      }});
      const s = {device, buffers:new Map(), next:1, pipelines:[], pipelineNames:[], profile:Module.profileGPU ? SWGPUProfile.create() : null, operation:{result:0,completion:null,sample:null}, presentOperation:{result:0,completion:null}, commandList:[null], readPromises:[], wordChunks:[], wordCount:0, reads:[], readCount:0, packed:{buffer:null,capacity:0}, times:{buffer:null,capacity:0}, error:null};
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
    const s=SWGPU.get(id); s.layout=s.device.createBindGroupLayout({entries:Array.from({length:3+checked},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}))});
    s.pipelineLayout=s.device.createPipelineLayout({bindGroupLayouts:[s.layout]});
    s.indirect=SWGPU.buffer(s,12,GPUBufferUsage.COPY_DST|GPUBufferUsage.INDIRECT);
  },
  web_pipeline__deps: ['$SWGPU', '$Asyncify'], web_pipeline: (id, ptr, size, slot, name) => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id), code=new TextDecoder().decode(HEAPU8.subarray(ptr>>>0,(ptr>>>0)+size));
    try {
      const module=s.device.createShaderModule({code});
      const report=await module.getCompilationInfo();
      const errors=report.messages.filter(x=>x.type==='error');
      if(errors.length)throw new Error(errors.map(x=>`${x.lineNum}:${x.linePos}: ${x.message}`).join('\n'));
      s.pipelineNames[slot]=UTF8ToString(name);
      s.pipelines[slot]=await s.device.createComputePipelineAsync({layout:s.pipelineLayout,compute:{module,entryPoint:'main'}}); return 1;
    }catch(error){return SWGPU.failure(error);}
  }),
  web_bindings__deps: ['$SWGPU'], web_bindings: (id, handle, words, floats, tiles, status) => {
    const s=SWGPU.get(id); s.buffer=s.buffers.get(handle);
    const entries=[{binding:0,resource:{buffer:s.buffer,offset:0,size:(words+1)*4}},{binding:1,resource:{buffer:s.buffer,offset:(words+1)*4,size:(floats+1)*4}}];
    entries.push({binding:2,resource:{buffer:s.buffer,offset:(words+floats+2)*4,size:(tiles+1)*4}});
    if(status)entries.push({binding:3,resource:{buffer:s.buffer,offset:(words+floats+tiles+3)*4,size:status*4}});
    s.bindings=s.device.createBindGroup({layout:s.layout,entries});
  },
  web_begin__deps: ['$SWGPU'], web_begin: id => { const s=SWGPU.get(id); SWGPU.releaseCommands(s); s.wordCount=0; s.encoder=s.device.createCommandEncoder(); if(s.profile)SWGPUProfile.begin(s); },
  web_end__deps: ['$SWGPU'], web_end: id => { const s=SWGPU.get(id); for(let i=0;i<s.wordCount;i+=256){const slot=s.wordChunks[i/256];s.device.queue.writeBuffer(slot.buffer,0,slot.words,0,Math.min(256,s.wordCount-i));} s.encoder.resolveQuerySet(s.queries,0,s.queryCount,s.queryResults,0); if(s.profile)SWGPUProfile.end(s); s.commands=s.encoder.finish(); if(s.profile?.current){s.profile.current.encoded=performance.now();s.profile.current.encodeMs=s.profile.current.encoded-s.profile.current.start;} s.encoder=null; },
  web_bind__deps: ['$SWGPU'], web_bind: (id, slot) => { SWGPU.get(id).pipeline=slot; },
  web_dispatch__deps: ['$SWGPU'], web_dispatch: (id, groups, offset, indirect) => {
    const s=SWGPU.get(id);
    if(indirect)s.encoder.copyBufferToBuffer(s.buffer,offset,s.indirect,0,12);
    if(s.profile?.current && indirect)s.profile.current.indirect++;
    const pass=s.encoder.beginComputePass(s.profile ? SWGPUProfile.pass(s) : undefined); pass.setPipeline(s.pipelines[s.pipeline]); pass.setBindGroup(0,s.bindings);
    if(indirect)pass.dispatchWorkgroupsIndirect(s.indirect,0);else if(groups)pass.dispatchWorkgroups(groups);
    pass.end();
  },
  web_clear__deps: ['$SWGPU'], web_clear: (id, offset, size) => { const s=SWGPU.get(id); s.encoder.clearBuffer(s.buffer,offset,size); },
  web_word__deps: ['$SWGPU'], web_word: (id, offset, value) => {
    const s=SWGPU.get(id), index=s.wordCount++, chunk=Math.floor(index/256), word=index%256;
    let slot=s.wordChunks[chunk];
    if(!slot){slot={buffer:SWGPU.buffer(s,1024,GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),words:new Uint32Array(256)};s.wordChunks.push(slot);}
    if(s.profile?.current)s.profile.current.wordCopies++;
    slot.words[word]=value; s.encoder.copyBufferToBuffer(slot.buffer,word*4,s.buffer,offset,4);
  },
  web_transfer__deps: ['$SWGPU'], web_transfer: (id, memory, offset, size, upload) => {
    const s=SWGPU.get(id);
    if(upload) { if(s.profile?.current)s.profile.current.uploadBytes+=size; s.device.queue.writeBuffer(s.buffer,offset,HEAPU8,(memory>>>0)+offset,size); return; }
    if(s.profile?.current){s.profile.current.readbackBytes+=size;s.profile.current.readbackBuffers++;}
    const index=s.readCount++;
    let slot=s.reads[index];
    if(!slot){slot={buffer:null,capacity:0,ptr:0,size:0};s.reads.push(slot);}
    const b=SWGPU.reserve(s,slot,size,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    slot.ptr=(memory>>>0)+offset; slot.size=size;
    s.encoder.copyBufferToBuffer(s.buffer,offset,b,0,size);
  },
  web_submit__deps: ['$SWGPU'], web_submit: id => {
    const s=SWGPU.get(id);
    try {
      if(s.pending)throw new Error('Renderer already has a pending submission');
      const sample=s.profile?.current;
      if(sample){sample.submitted=performance.now();sample.encodeToSubmitMs=sample.submitted-sample.encoded;}
      s.commandList[0]=s.commands; s.device.queue.submit(s.commandList); s.commandList[0]=null; s.commands=null;
      if(sample){sample.submitCallMs=performance.now()-sample.submitted;SWGPUProfile.submitted(sample);}
      if(s.profile)s.profile.index++;
      const operation=s.operation; operation.result=0; operation.sample=sample; s.pending=operation;
      const done=s.device.queue.onSubmittedWorkDone();
      const reads=s.readPromises; reads.length=0;
      for(let i=0;i<s.readCount;i++) { const r=s.reads[i]; reads.push((async()=>{
        await r.buffer.mapAsync(GPUMapMode.READ);
        const mapped=sample ? performance.now() : 0;
        if(sample)sample.readbackMapMs=Math.max(sample.readbackMapMs,mapped-sample.submitted);
        try { HEAPU8.set(new Uint8Array(r.buffer.getMappedRange(0,r.size)),r.ptr); }
        finally { r.buffer.unmap(); if(sample)sample.readbackCopyMs+=performance.now()-mapped; }
      })()); }
      if(sample) {
        reads.push(SWGPUProfile.read(sample));
        reads.push(done.then(()=> { sample.queueMs=performance.now()-sample.submitted; }));
      }
      reads.push(done);
      operation.completion=Promise.allSettled(reads).then(results=>{
        const failure=results.find(result=>result.status==='rejected');
        SWGPU.releaseCommands(s);
        if(sample)SWGPUProfile.complete(s,sample);
        if(failure||s.error){SWGPU.failure(failure?.reason||s.error);operation.result=-1;}
        else operation.result=1;
        return operation.result;
      });
      return 1;
    }catch(error){return SWGPU.failure(error);}
  },
  web_poll__deps: ['$SWGPU'], web_poll: id => {
    const s=SWGPU.get(id); if(!s.pending)return 1;
    if(s.pending.sample)s.pending.sample.polls++;
    const result=s.pending.result;
    if(result){if(s.profile)SWGPUProfile.observed(s);s.pending=null;}
    return result;
  },
  web_wait__deps: ['$SWGPU', '$Asyncify'], web_wait: id => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id); if(!s.pending)return 1;
    if(s.profile)SWGPUProfile.yield(s);
    const result=await s.pending.completion; if(s.profile)SWGPUProfile.observed(s);s.pending=null; return result===1;
  }),
  web_idle__deps: ['$SWGPU', '$Asyncify'], web_idle: id => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id);
    if(s.profile)SWGPUProfile.yield(s);
    if(s.pending)await Promise.race([s.pending.completion,new Promise(resolve=>setTimeout(resolve,1))]);
  }),
  web_present_start__deps: ['$SWGPU'], web_present_start: (id, offset, width, height) => {
    const s=SWGPU.get(id), canvas=Module.canvas;
    s.presentTime=0n;
    if(s.presentation)throw new Error('Presentation already pending');
    const operation=s.presentOperation; operation.result=0; s.presentation=operation;
    operation.completion=(async()=>{
    const sample=s.profile?.current, start=sample ? performance.now() : 0;
    try {
    if(!await SWGPU.frameReady())return 2;
    if(sample)sample.presentWaitMs=performance.now()-start;
    if(s.error)throw s.error;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    if(!s.context){s.context=canvas.getContext('webgpu');s.context.configure({device:s.device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});}
    const encoder=s.device.createCommandEncoder(), pitch=Math.ceil(width*4/256)*256;
    let buffer=s.buffer, sourceOffset=offset;
    if(pitch!==width*4){const packed=SWGPU.reserve(s,s.packed,pitch*height,GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);for(let y=0;y<height;y++)encoder.copyBufferToBuffer(buffer,offset+y*width*4,packed,y*pitch,width*4);buffer=packed;sourceOffset=0;}
    encoder.copyBufferToTexture({buffer,offset:sourceOffset,bytesPerRow:pitch,rowsPerImage:height},{texture:s.context.getCurrentTexture()},[width,height]);
    const commands=encoder.finish({label:"presentation"});
    s.presentTime=BigInt(Math.round(performance.now()*1000000));
    if(s.profile)SWGPUProfile.present(s);
    s.commandList[0]=commands; s.device.queue.submit(s.commandList); s.commandList[0]=null;
    if(s.profile)await SWGPUProfile.finish(s);
    if(s.error)throw s.error;
    return 1;
    } catch(error) {SWGPU.failure(error);return -1;}
    })().then(result=>{operation.result=result;return result;});
    return 1;
  },
  web_present_poll__deps: ['$SWGPU'], web_present_poll: id => {
    const s=SWGPU.get(id), result=s.presentation.result;
    if(result)s.presentation=null;
    return result;
  },
  web_present_time__deps: ['$SWGPU'], web_present_time: id => SWGPU.get(id).presentTime || 0n,
  web_present_idle__deps: ['$SWGPU', '$Asyncify'], web_present_idle: id => Asyncify.handleAsync(async()=> {
    await Promise.race([SWGPU.get(id).presentation.completion,new Promise(resolve=>setTimeout(resolve,1))]);
  }),
  web_present__deps: ['$SWGPU', '$Asyncify', 'web_present_start'], web_present: (id, offset, width, height) => Asyncify.handleAsync(async()=> {
    _web_present_start(id,offset,width,height);
    const s=SWGPU.get(id), result=await s.presentation.completion;
    s.presentation=null;return result>0;
  }),
  web_queries__deps: ['$SWGPU'], web_queries: (id, count) => { const s=SWGPU.get(id); s.queryCount=count;s.queries=s.device.createQuerySet({type:'timestamp',count});s.queryResults=SWGPU.buffer(s,count*8,GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC);return 1; },
  web_stamp__deps: ['$SWGPU'], web_stamp: (id, index) => { const s=SWGPU.get(id); const pass=s.encoder.beginComputePass({timestampWrites:{querySet:s.queries,beginningOfPassWriteIndex:index}});pass.end(); },
  web_times__deps: ['$SWGPU', '$Asyncify'], web_times: (id, ptr) => Asyncify.handleAsync(async()=> {
    const s=SWGPU.get(id), b=SWGPU.reserve(s,s.times,s.queryCount*8,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    try { const encoder=s.device.createCommandEncoder();encoder.copyBufferToBuffer(s.queryResults,0,b,0,s.queryCount*8);s.device.queue.submit([encoder.finish()]);await b.mapAsync(GPUMapMode.READ);HEAPU8.set(new Uint8Array(b.getMappedRange(0,s.queryCount*8)),ptr>>>0);b.unmap();return 1; }
    catch(error){return SWGPU.failure(error);}
  }),
  web_now: () => BigInt(Math.round(performance.now() * 1000000)),
});
