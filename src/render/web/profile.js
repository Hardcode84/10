// Explicit diagnostics. Normal frames allocate no profiling resources.
mergeInto(LibraryManager.library, {
  $SWGPUProfile: {
    warmup: 8,
    baseline: 24,
    detailed: 16,
    create() { return {index:0, samples:[], current:null, previousPresent:null, reported:false}; },
    begin(s) {
      const p=s.profile;
      if(p.current)SWGPUProfile.release(p.current);
      p.current=null;
      const index=p.index - SWGPUProfile.warmup;
      if(index<0 || index>=SWGPUProfile.baseline+SWGPUProfile.detailed)return;
      p.current={phase:index<SWGPUProfile.baseline?'baseline':'timestamps', start:performance.now(),
        dispatches:0, indirect:0, uploadBytes:0, wordCopies:0, readbackBytes:0, readbackBuffers:0,
        readbackMapMs:0, readbackCopyMs:0, maxEventLoopLagMs:0, idleCalls:0, polls:0, chunks:[], stages:{}};
      const sample=p.current;
      if(sample.phase==='timestamps') {
        sample.boundary={query:s.device.createQuerySet({type:'timestamp',count:2}),names:[]};
        const pass=s.encoder.beginComputePass({timestampWrites:{querySet:sample.boundary.query,beginningOfPassWriteIndex:0}});
        pass.end();
      }
    },
    pass(s) {
      const sample=s.profile.current;
      if(!sample)return undefined;
      sample.dispatches++;
      if(sample.phase==='baseline')return undefined;
      let chunk=sample.chunks.at(-1);
      if(!chunk || chunk.names.length===128) {
        chunk={query:s.device.createQuerySet({type:'timestamp',count:256}),names:[]};
        sample.chunks.push(chunk);
      }
      const index=chunk.names.length*2;
      chunk.names.push(s.pipelineNames[s.pipeline]);
      return {timestampWrites:{querySet:chunk.query,beginningOfPassWriteIndex:index,endOfPassWriteIndex:index+1}};
    },
    end(s) {
      const sample=s.profile.current;
      if(!sample)return;
      for(const chunk of sample.chunks)SWGPUProfile.resolve(s,chunk,chunk.names.length*2);
      if(sample.boundary) {
        const pass=s.encoder.beginComputePass({timestampWrites:{querySet:sample.boundary.query,endOfPassWriteIndex:1}});
        pass.end();
        SWGPUProfile.resolve(s,sample.boundary,2);
      }
    },
    resolve(s, chunk, count) {
      const size=count*8;
      chunk.resolve=s.device.createBuffer({size,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
      chunk.read=s.device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      s.encoder.resolveQuerySet(chunk.query,0,count,chunk.resolve,0);
      s.encoder.copyBufferToBuffer(chunk.resolve,0,chunk.read,0,size);
    },
    async read(sample) {
      let first, last, boundary;
      try {
        const results=await Promise.allSettled([...sample.chunks,...(sample.boundary ? [sample.boundary] : [])].map(async chunk=> {
          await chunk.read.mapAsync(GPUMapMode.READ);
          sample.timestampMapMs=Math.max(sample.timestampMapMs || 0,performance.now()-sample.submitted);
          try {
            const values=new BigUint64Array(chunk.read.getMappedRange());
            if(chunk===sample.boundary) { boundary=[values[0],values[1]]; return; }
            for(let i=0;i<chunk.names.length;i++) {
              const begin=values[i*2], end=values[i*2+1];
              if(first===undefined || begin<first)first=begin;
              if(last===undefined || end>last)last=end;
              const name=chunk.names[i], stage=sample.stages[name] ||= {ms:0,dispatches:0};
              stage.ms+=Number(end-begin)/1e6; stage.dispatches++;
            }
          } finally { chunk.read.unmap(); }
        }));
        const failure=results.find(result=>result.status==='rejected');
        if(failure)throw failure.reason;
        if(first!==undefined)sample.gpuSpanMs=Number(last-first)/1e6;
        if(boundary) {
          sample.gpuCommandSpanMs=Number(boundary[1]-boundary[0])/1e6;
          if(first!==undefined) {
            sample.gpuBeforePassesMs=Number(first-boundary[0])/1e6;
            sample.gpuAfterPassesMs=Number(boundary[1]-last)/1e6;
          }
        }
      } finally { SWGPUProfile.release(sample); }
    },
    release(sample) {
      for(const chunk of [...sample.chunks,...(sample.boundary ? [sample.boundary] : [])]) {
        chunk.read?.destroy(); chunk.resolve?.destroy(); chunk.query.destroy();
      }
      sample.chunks=[]; sample.boundary=null;
    },
    submitted(sample) {
      // This callback runs only after the current JS/Wasm stack yields.
      Promise.resolve().then(()=> { sample.microtaskDelayMs=performance.now()-sample.submitted; });
      sample.turnTimer=setTimeout(()=> { sample.eventTurnMs=performance.now()-sample.submitted; },0);
      SWGPUProfile.watchEventLoop(sample);
    },
    watchEventLoop(sample) {
      const due=performance.now()+4;
      sample.lagTimer=setTimeout(()=> {
        sample.maxEventLoopLagMs=Math.max(sample.maxEventLoopLagMs,performance.now()-due);
        SWGPUProfile.watchEventLoop(sample);
      },4);
    },
    yield(s) {
      const sample=s.pending?.sample;
      if(!sample)return;
      sample.idleCalls++;
      if(sample.firstYieldMs===undefined)sample.firstYieldMs=performance.now()-sample.submitted;
    },
    observed(s) {
      const sample=s.pending?.sample;
      if(sample)sample.observedMs=performance.now()-sample.submitted;
    },
    complete(s, sample) {
      sample.retirementMs=performance.now()-sample.submitted;
      clearTimeout(sample.turnTimer); clearTimeout(sample.lagTimer);
      // A missing eventTurnMs means GPU completion beat the timer callback.
      s.profile.samples.push(sample);
    },
    present(s) {
      const p=s.profile, time=performance.now(), sample=p.current;
      if(sample && p.previousPresent!==null)sample.presentIntervalMs=time-p.previousPresent;
      p.previousPresent=time;
    },
    summary(samples) {
      const result={submissions:samples.length};
      for(const key of ['encodeMs','queueMs','retirementMs','presentIntervalMs','presentWaitMs','gpuSpanMs','gpuCommandSpanMs','gpuBeforePassesMs','gpuAfterPassesMs','submitCallMs','encodeToSubmitMs','firstYieldMs','microtaskDelayMs','eventTurnMs','maxEventLoopLagMs','readbackMapMs','readbackCopyMs','timestampMapMs','observedMs','idleCalls','polls','dispatches','indirect','uploadBytes','wordCopies','readbackBytes','readbackBuffers']) {
        const values=samples.map(s=>s[key]).filter(v=>v!==undefined).sort((a,b)=>a-b);
        if(values.length)result[key]={p50:values[Math.ceil(values.length*0.5)-1],p95:values[Math.ceil(values.length*0.95)-1]};
      }
      return result;
    },
    report(s, final) {
      const p=s.profile;
      if(p.reported || (!final && p.samples.length<SWGPUProfile.baseline+SWGPUProfile.detailed))return;
      p.reported=true;
      const baseline=p.samples.filter(s=>s.phase==='baseline'), detailed=p.samples.filter(s=>s.phase==='timestamps');
      const stages={};
      for(const sample of detailed)for(const [name,stage] of Object.entries(sample.stages)) {
        const sum=stages[name] ||= {meanMs:0,meanDispatches:0};
        sum.meanMs+=stage.ms/detailed.length; sum.meanDispatches+=stage.dispatches/detailed.length;
      }
      const result={complete:p.samples.length===SWGPUProfile.baseline+SWGPUProfile.detailed,
        width:Module.canvas.width,height:Module.canvas.height,
        baseline:SWGPUProfile.summary(baseline),timestamps:SWGPUProfile.summary(detailed),stages, idleProbe:p.idleProbe};
      Module.print('WebGPU profile: '+JSON.stringify(result));
      Module.webGPUProfile=result;
    },
    async finish(s) {
      const p=s.profile;
      if(p.reported || p.samples.length<SWGPUProfile.baseline+SWGPUProfile.detailed)return;
      // Drain once before the idle control, outside the measured frames.
      await s.device.queue.onSubmittedWorkDone();
      p.idleProbe=await SWGPUProfile.probe(s);
      SWGPUProfile.report(s,false);
    },
    async probe(s) {
      const buffer=s.device.createBuffer({size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const samples=[];
      try {
        for(let i=0;i<5;i++) {
          const encoder=s.device.createCommandEncoder();
          encoder.clearBuffer(buffer);
          const commands=encoder.finish(), sample={}, start=performance.now();
          s.device.queue.submit([commands]);
          sample.submitCallMs=performance.now()-start;
          const done=s.device.queue.onSubmittedWorkDone().then(()=> { sample.queueMs=performance.now()-start; });
          const mapped=buffer.mapAsync(GPUMapMode.READ).then(()=> {
            sample.readbackMapMs=performance.now()-start;
            buffer.unmap();
          });
          const results=await Promise.allSettled([done,mapped]);
          const failure=results.find(result=>result.status==='rejected');
          if(failure)throw failure.reason;
          samples.push(sample);
        }
      } finally { buffer.destroy(); }
      return SWGPUProfile.summary(samples);
    },
    close(s) {
      SWGPUProfile.report(s,true);
      if(s.profile.current) {
        clearTimeout(s.profile.current.turnTimer); clearTimeout(s.profile.current.lagTimer);
        SWGPUProfile.release(s.profile.current);
      }
    },
  },
});
