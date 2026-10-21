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
        dispatches:0, indirect:0, uploadBytes:0, wordCopies:0, chunks:[], stages:{}};
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
      for(const chunk of sample.chunks) {
        const size=chunk.names.length*16;
        chunk.resolve=s.device.createBuffer({size,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
        chunk.read=s.device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
        s.encoder.resolveQuerySet(chunk.query,0,chunk.names.length*2,chunk.resolve,0);
        s.encoder.copyBufferToBuffer(chunk.resolve,0,chunk.read,0,size);
      }
    },
    async read(sample) {
      let first, last;
      try {
        const results=await Promise.allSettled(sample.chunks.map(async chunk=> {
          await chunk.read.mapAsync(GPUMapMode.READ);
          try {
            const values=new BigUint64Array(chunk.read.getMappedRange());
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
      } finally { SWGPUProfile.release(sample); }
    },
    release(sample) {
      for(const chunk of sample.chunks) {
        chunk.read?.destroy(); chunk.resolve?.destroy(); chunk.query.destroy();
      }
      sample.chunks=[];
    },
    submitted(s, sample) {
      sample.submitted=performance.now();
      return SWGPUProfile.read(sample);
    },
    complete(s, sample) {
      sample.retirementMs=performance.now()-sample.submitted;
      s.profile.samples.push(sample);
    },
    present(s) {
      const p=s.profile, time=performance.now(), sample=p.current;
      if(sample && p.previousPresent!==null)sample.presentIntervalMs=time-p.previousPresent;
      p.previousPresent=time;
    },
    summary(samples) {
      const result={submissions:samples.length};
      for(const key of ['encodeMs','queueMs','retirementMs','presentIntervalMs','presentWaitMs','presentQueueMs','gpuSpanMs','dispatches','indirect','uploadBytes','wordCopies']) {
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
        baseline:SWGPUProfile.summary(baseline),timestamps:SWGPUProfile.summary(detailed),stages};
      Module.print('WebGPU profile: '+JSON.stringify(result));
      Module.webGPUProfile=result;
    },
    close(s) {
      SWGPUProfile.report(s,true);
      if(s.profile.current)SWGPUProfile.release(s.profile.current);
    },
  },
});
