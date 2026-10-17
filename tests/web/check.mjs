import {flight} from './browser.mjs';
import {presentation} from './presentation.mjs';

// Use a separate browser profile with remote debugging enabled.
const endpoint = process.env.BROWSER_CDP || 'http://127.0.0.1:9227';
const origin = process.env.GAME_URL || 'http://127.0.0.1:8000';
const pages = await (await fetch(endpoint + '/json')).json();
const page = pages.find(page => page.type === 'page');
if (!page) throw Error('Open a browser tab before the check');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject) => { socket.onopen=resolve; socket.onerror=reject; });
let id=0;
const pending=new Map();
let loaded;
socket.onmessage = event => {
  const message=JSON.parse(event.data);
  if(message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  if(message.method==='Page.loadEventFired') loaded?.();
};
async function call(method, params={}) {
  const response=await new Promise(resolve => {pending.set(++id,resolve);socket.send(JSON.stringify({id,method,params}));});
  if(response.error) throw Error(JSON.stringify(response.error));
  return response.result;
}
function require(condition, message) { if(!condition)throw Error(message); }
async function evaluate(fn, argument, url=origin+'/') {
  const load=new Promise(resolve => {loaded=resolve;});
  await call('Page.navigate',{url:url+'?test='+Date.now()}); await load;
  await call('Page.bringToFront');
  const result=await call('Runtime.evaluate', {expression:`(${fn})(${JSON.stringify(argument)})`, awaitPromise:true, returnByValue:true, userGesture:true});
  require(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function browser(options) {
  const value=await evaluate(flight,options);
  if(options.deviceLoss) {
    require(value.status==='Run failed. See the log.' && value.errors.length>0,JSON.stringify(value));
  } else {
    require(value.status==='Run ended.' && value.errors.length===0, JSON.stringify(value));
  }
  return value;
}
function compareImage(a, b) {
  const left=Buffer.from(a,"base64"),right=Buffer.from(b,"base64");
  require(left.length===right.length,"Capture dimensions differ");
  const header=/^P6\n(\d+) (\d+)\n255\n/.exec(left.subarray(0,64).toString());
  require(header!==null,'Invalid capture header');
  const start=header[0].length,width=Number(header[1]),height=Number(header[2]);
  require(left.subarray(0,start).equals(right.subarray(0,start)),'Capture headers differ');
  const matches=(a,ai,b,bi) => [0,1,2].every(c=>Math.abs(a[start+ai*3+c]-b[start+bi*3+c])<=1);
  const nearby=(a,b,index) => {
    const x=index%width,y=Math.floor(index/width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height&&matches(a,index,b,(y+dy)*width+x+dx))return true;
    }
    return false;
  };
  let changed=0,edges=0;
  for(let i=0;i<width*height;i++) {
    if(left.subarray(start+i*3,start+i*3+3).equals(right.subarray(start+i*3,start+i*3+3)))continue;
    changed++;
    if(!matches(left,i,right,i)) {
      require(nearby(left,right,i)&&nearby(right,left,i),'Capture pixel differs outside a one-pixel sampling edge at '+i);
      edges++;
    }
  }
  require(changed<=width*height/1000,"Too many image differences: "+changed);
  console.log(`Capture comparison: ${changed} changed pixels, ${edges} sampling edges, of ${width*height}`);
}
function checkCommands(encoded) {
  const bytes=Buffer.from(encoded,'base64');
  let flags=0,reel=false,thrust=false,look=false;
  const ticks=(bytes.length-64)/40;
  require(ticks>0 && bytes.readUInt32LE(bytes.length-36)===ticks,'Flight recording has an invalid tick count');
  for(let offset=24;offset<bytes.length-40;offset+=40) {
    thrust ||= bytes.readUInt32LE(offset+12)!==0;
    look ||= bytes.readUInt32LE(offset+24)!==0;
    reel ||= bytes.readUInt32LE(offset+28)!==0;
    flags |= bytes.readUInt32LE(offset+32);
  }
  require(thrust&&look&&reel&&(flags&7)===7,'SDL did not record thrust, roll, tether, reel, boost and brake');
}
async function native(recording, tag) {
  const path=`build/web-check-${tag}`;
  await Bun.write(path+'.swr', Buffer.from(recording,'base64'));
  const child=Bun.spawn(['build/game','--headless','--seed','42','--complexity','2','--width','641','--height','359','--replay',path+'.swr','--capture',path+'.ppm'],{stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  require(code===0,stdout+stderr);
  return {log:stdout, capture:Buffer.from(await Bun.file(path+'.ppm').arrayBuffer()).toString('base64')};
}
const timeout=setTimeout(()=>{console.error('Browser check timed out');process.exit(1);},120000);
try {
  await call('Page.enable');
  if(process.argv[2] === '--presentation') {
    const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('<!doctype html><title>WebGPU presentation witness</title>',{headers:{'Content-Type':'text/html'}})});
    try {console.log(await evaluate(presentation,180,server.url.href));}
    finally {server.stop();}
  } else {
  require(process.argv.length===2,'Use no arguments or --presentation');
  const raw=await browser({}),checked=await browser({checked:true});
  await Bun.write('build/web-check-raw.ppm',Buffer.from(raw.capture,'base64'));await Bun.write('build/web-check-checked.ppm',Buffer.from(checked.capture,'base64'));compareImage(raw.capture,checked.capture);
  const initial=await native(raw.recording,'initial');
  await Bun.write('build/web-check-browser.ppm',Buffer.from(raw.capture,'base64'));
  compareImage(initial.capture,raw.capture);
  const controlled=await browser({controls:true});
  checkCommands(controlled.recording);
  require(controlled.frames>0,'No window frames');
  require(controlled.paused,'Tab did not pause simulation recording');
  const replay=await browser({replay:controlled.recording});
  const desktop=await native(controlled.recording,'flight');
  compareImage(desktop.capture,replay.capture);
  const fullscreen=await browser({controls:true,fullscreen:true});
  require(fullscreen.fullscreen,'Fullscreen did not open');
  await browser({controls:true,deviceLoss:true});
  console.log('Web: raw/checked capture, SDL flight and pause, fullscreen, arbitrary row width, recording/replay, native tick hashes and images, and device-loss cleanup passed');
  }
} finally {clearTimeout(timeout);socket.close();}
