import { useEffect, useRef, useState, useCallback } from 'react';
import { PAIRS, TOP_TABS, CATEGORIES } from '../lib/pairs';
import { calcMA, calcEMA, calcBB, calcRSI, calcMACD, heikinAshi, genCandles } from '../lib/indicators';
import Heatmap from '../components/Heatmap';

const TF_MS = {'1m':60000,'5m':300000,'15m':900000,'1H':3600000,'4H':14400000,'1D':86400000,'1W':604800000};
const TFS   = ['1m','5m','15m','1H','4H','1D','1W'];
const fmt   = (n,d) => Number(n).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
const PAD   = {l:66,r:12,t:12,b:22};

function createCS(){ return {offsetX:0,scaleX:1,isDragging:false,dragStartX:0,dragStartOffset:0}; }

// - Chart drawing engine -
function drawChart(cvs,src,ct,iState,p,mx,my,cs){
  if(!cvs||!src?.length) return '';
  const W=cvs.parentElement?.clientWidth||400;
  const H=cvs.parentElement?.clientHeight||300;
  if(cvs.width!==W) cvs.width=W;
  if(cvs.height!==H) cvs.height=H;
  const ctx=cvs.getContext('2d');
  ctx.clearRect(0,0,W,H); ctx.fillStyle='#0b0c11'; ctx.fillRect(0,0,W,H);

  const totalBars=Math.max(20,Math.floor(80/cs.scaleX));
  const startIdx=Math.max(0,src.length-totalBars+Math.floor(cs.offsetX/8));
  const vis=src.slice(Math.max(0,startIdx));
  const data=ct==='heikin'?heikinAshi(vis):vis;
  if(!data.length) return '';

  const allP=data.flatMap(c=>[c.h,c.l]);
  let lo=Math.min(...allP),hi=Math.max(...allP);
  const pad=(hi-lo)*0.1; lo-=pad; hi+=pad;
  const cw=(W-PAD.l-PAD.r)/data.length;
  const py=v=>PAD.t+(1-(v-lo)/(hi-lo))*(H-PAD.t-PAD.b);
  const px=i=>PAD.l+i*cw+cw*0.5;

  // Grid
  ctx.strokeStyle='#14161f'; ctx.lineWidth=1; ctx.setLineDash([2,6]);
  for(let i=0;i<=5;i++){
    const y=PAD.t+i*(H-PAD.t-PAD.b)/5;
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(W-PAD.r,y); ctx.stroke();
    ctx.fillStyle='#3a3f5c'; ctx.font='9px JetBrains Mono'; ctx.textAlign='right';
    ctx.fillText(fmt(hi-(hi-lo)*i/5,p.dec),PAD.l-3,y+3);
  }
  ctx.setLineDash([]);

  // Fib
  if(iState.fib){
    const fR=[0,0.236,0.382,0.5,0.618,0.786,1];
    const fC=['#f03060','#f5a623','#1bd4e8','#3d7fff','#00c87a','#f5a623','#f03060'];
    fR.forEach((f,i)=>{
      const yf=py(lo+(hi-lo)*(1-f));
      ctx.strokeStyle=fC[i]; ctx.globalAlpha=0.28; ctx.lineWidth=0.5; ctx.setLineDash([3,4]);
      ctx.beginPath(); ctx.moveTo(PAD.l,yf); ctx.lineTo(W-PAD.r,yf); ctx.stroke();
      ctx.globalAlpha=1; ctx.setLineDash([]);
      ctx.fillStyle=fC[i]; ctx.font='8px JetBrains Mono'; ctx.textAlign='left';
      ctx.fillText((f*100).toFixed(1)+'%',PAD.l+2,yf-2);
    });
  }

  // Ichi
  if(iState.ichi&&src.length>52){
    const ns=src.slice(-80);
    const ten=ns.map((_,i)=>{ if(i<8)return null; const s=ns.slice(i-8,i+1); return(Math.max(...s.map(c=>c.h))+Math.min(...s.map(c=>c.l)))/2; });
    const kij=ns.map((_,i)=>{ if(i<25)return null; const s=ns.slice(i-25,i+1); return(Math.max(...s.map(c=>c.h))+Math.min(...s.map(c=>c.l)))/2; });
    const cpts=ten.map((t,i)=>t&&kij[i]?{sa:(t+kij[i])/2,sb:kij[i],i}:null).filter(Boolean);
    if(cpts.length>1){
      ctx.beginPath(); cpts.forEach((pt,j)=>j?ctx.lineTo(px(pt.i),py(pt.sa)):ctx.moveTo(px(pt.i),py(pt.sa)));
      [...cpts].reverse().forEach(pt=>ctx.lineTo(px(pt.i),py(pt.sb)));
      ctx.closePath(); ctx.fillStyle='rgba(61,127,255,.07)'; ctx.fill();
    }
    ctx.strokeStyle='#f5a623'; ctx.lineWidth=1; ctx.beginPath(); let st=false;
    ten.forEach((v,i)=>{ if(!v)return; st?ctx.lineTo(px(i),py(v)):(ctx.moveTo(px(i),py(v)),st=true); }); ctx.stroke();
    ctx.strokeStyle='#3d7fff'; ctx.lineWidth=1; ctx.beginPath(); st=false;
    kij.forEach((v,i)=>{ if(!v)return; st?ctx.lineTo(px(i),py(v)):(ctx.moveTo(px(i),py(v)),st=true); }); ctx.stroke();
  }

  // VWAP
  if(iState.vwap){
    let tv=0,tvp=0; ctx.strokeStyle='#1bd4e8'; ctx.lineWidth=1.2; ctx.beginPath();
    data.forEach((c,i)=>{ tv+=c.v; tvp+=c.v*(c.h+c.l+c.c)/3; const v=tvp/tv; i?ctx.lineTo(px(i),py(v)):ctx.moveTo(px(i),py(v)); }); ctx.stroke();
  }

  // BB
  if(iState.bb){
    const bbs=calcBB(src,20).slice(-data.length);
    ctx.strokeStyle='rgba(155,127,245,.45)'; ctx.lineWidth=0.8; ctx.setLineDash([3,4]);
    ['up','dn'].forEach(k=>{ ctx.beginPath(); let st=false; bbs.forEach((b,i)=>{ if(!b)return; st?ctx.lineTo(px(i),py(b[k])):(ctx.moveTo(px(i),py(b[k])),st=true); }); ctx.stroke(); });
    ctx.setLineDash([]);
    const ups=bbs.map((b,i)=>b?{x:px(i),y:py(b.up)}:null).filter(Boolean);
    ctx.beginPath(); ups.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));
    bbs.map((b,i)=>b?{x:px(i),y:py(b.dn)}:null).filter(Boolean).reverse().forEach(pt=>ctx.lineTo(pt.x,pt.y));
    ctx.closePath(); ctx.fillStyle='rgba(155,127,245,.03)'; ctx.fill();
  }

  // MA20
  if(iState.ma){
    const mas=calcMA(src,20).slice(-data.length);
    ctx.strokeStyle='#3d7fff'; ctx.lineWidth=1; ctx.beginPath(); let st=false;
    mas.forEach((m,i)=>{ if(!m)return; st?ctx.lineTo(px(i),py(m)):(ctx.moveTo(px(i),py(m)),st=true); }); ctx.stroke();
  }

  // EMA9
  if(iState.ema){
    const emas=calcEMA(src,9).slice(-data.length);
    ctx.strokeStyle='#ff7b3d'; ctx.lineWidth=1; ctx.setLineDash([2,2]); ctx.beginPath(); let st=false;
    emas.forEach((m,i)=>{ if(!m)return; st?ctx.lineTo(px(i),py(m)):(ctx.moveTo(px(i),py(m)),st=true); }); ctx.stroke(); ctx.setLineDash([]);
  }

  // Candles / Line / H-Ashi
  if(ct==='line'){
    ctx.strokeStyle='#3d7fff'; ctx.lineWidth=1.5; ctx.beginPath();
    data.forEach((c,i)=>i?ctx.lineTo(px(i),py(c.c)):ctx.moveTo(px(i),py(c.c))); ctx.stroke();
    ctx.lineTo(px(data.length-1),H); ctx.lineTo(px(0),H); ctx.closePath();
    const gr=ctx.createLinearGradient(0,0,0,H); gr.addColorStop(0,'rgba(61,127,255,.15)'); gr.addColorStop(1,'rgba(61,127,255,0)');
    ctx.fillStyle=gr; ctx.fill();
  } else {
    const bw=Math.max(cw*0.6,1.2);
    data.forEach((c,i)=>{
      const bull=c.c>=c.o;
      ctx.strokeStyle=bull?'#00c87a':'#f03060'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px(i),py(c.h)); ctx.lineTo(px(i),py(c.l)); ctx.stroke();
      const top=Math.min(py(c.c),py(c.o)),bh=Math.max(Math.abs(py(c.c)-py(c.o)),1);
      ctx.fillStyle=bull?'rgba(0,200,122,.88)':'rgba(240,48,96,.88)';
      ctx.fillRect(px(i)-bw/2,top,bw,bh); ctx.strokeRect(px(i)-bw/2,top,bw,bh);
    });
  }

  // X-axis dates
  ctx.fillStyle='#3a3f5c'; ctx.font='9px JetBrains Mono'; ctx.textAlign='center';
  const step=Math.max(1,Math.floor(data.length/6));
  data.forEach((c,i)=>{ if(i%step===0){ const d=new Date(c.t); ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`,px(i),H-4); } });

  // Crosshair
  let tip='';
  if(mx>PAD.l&&mx<W-PAD.r&&my>PAD.t&&my<H-PAD.b){
    ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=1; ctx.setLineDash([4,6]);
    ctx.beginPath(); ctx.moveTo(mx,PAD.t); ctx.lineTo(mx,H-PAD.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.l,my); ctx.lineTo(W-PAD.r,my); ctx.stroke(); ctx.setLineDash([]);
    const pv=hi-(my-PAD.t)/(H-PAD.t-PAD.b)*(hi-lo);
    ctx.fillStyle='#3d7fff'; ctx.fillRect(0,my-9,PAD.l-1,18);
    ctx.fillStyle='#fff'; ctx.font='9px JetBrains Mono'; ctx.textAlign='right';
    ctx.fillText(fmt(pv,p.dec),PAD.l-3,my+3);
    const idx=Math.min(Math.floor((mx-PAD.l)/cw),data.length-1);
    if(idx>=0){ const c=data[idx],d=new Date(c.t); tip=`O ${fmt(c.o,p.dec)}  H ${fmt(c.h,p.dec)}  L ${fmt(c.l,p.dec)}  C ${fmt(c.c,p.dec)}  ${d.toLocaleDateString()}`; }
  }
  return tip;
}

function drawSub(cvs,data,lo,hi,type){
  if(!cvs) return;
  const W=cvs.parentElement?.clientWidth||100,H=cvs.parentElement?.clientHeight||80;
  if(cvs.width!==W) cvs.width=W; if(cvs.height!==H) cvs.height=H;
  const ctx=cvs.getContext('2d'); ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0b0c11'; ctx.fillRect(0,0,W,H);
  const P={l:2,r:2,t:16,b:2},n=data.length,cw=(W-P.l-P.r)/n;
  const py=v=>P.t+(1-(v-lo)/(hi-lo))*(H-P.t-P.b);
  if(type==='line'){
    if(lo===0&&hi===100)[30,50,70].forEach(l=>{
      ctx.strokeStyle=l===50?'#14161f':'rgba(58,63,92,.4)'; ctx.lineWidth=0.5; ctx.setLineDash([2,4]);
      ctx.beginPath(); ctx.moveTo(0,py(l)); ctx.lineTo(W,py(l)); ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.strokeStyle='#f5a623'; ctx.lineWidth=1.5; ctx.beginPath(); let st=false;
    data.forEach((v,i)=>{ if(v==null)return; const x=P.l+i*cw+cw*.5; st?ctx.lineTo(x,py(v)):(ctx.moveTo(x,py(v)),st=true); }); ctx.stroke();
  } else if(type==='hist'){
    data.forEach((v,i)=>{ if(v==null)return; const x=P.l+i*cw,mid=py(0),y=py(v); ctx.fillStyle=v>=0?'rgba(0,200,122,.7)':'rgba(240,48,96,.7)'; ctx.fillRect(x,Math.min(y,mid),Math.max(cw-.5,1),Math.abs(y-mid)); });
  } else if(type==='vol'){
    data.forEach((c,i)=>{ const x=P.l+i*cw,h=(c.v/hi)*(H-P.t-P.b); ctx.fillStyle=c.c>=c.o?'rgba(0,200,122,.45)':'rgba(240,48,96,.45)'; ctx.fillRect(x,H-P.b-h,Math.max(cw-.5,1),h); });
  }
}

// - Main App -
export default function SignalAI(){
  const [activePair,  setActivePair]   = useState('BTC/USDT');
  const [activeTF,    setActiveTF]     = useState('4H');
  const [chartType,   setChartType]    = useState('candle');
  const [inds,        setInds]         = useState({ma:true,ema:true,bb:true,vwap:false,ichi:false,fib:false});
  const [signal,      setSignal]       = useState(null);
  const [heatmap,     setHeatmap]      = useState(null);
  const [masterSignal,setMasterSignal] = useState(null);
  const [analysing,   setAnalysing]    = useState(false);
  const [menuOpen,    setMenuOpen]     = useState(false);
  const [historyOpen, setHistoryOpen]  = useState(false);
  const [tfOpen,      setTfOpen]       = useState(false);
  const [indOpen,     setIndOpen]      = useState(false);
  const [chartOpen,   setChartOpen]    = useState(false);
  const [signalHistory,setSH]          = useState([]);
  const [prices,      setPrices]       = useState({});
  const [wsStatus,    setWsStatus]     = useState('...');
  const [clock,       setClock]        = useState('');
  const [tooltip,     setTooltip]      = useState('');
  const [wlFilter,    setWlFilter]     = useState('');

  const livePricesRef=useRef({}), candlesRef=useRef({});
  const activePairRef=useRef('BTC/USDT'), activeTFRef=useRef('4H');
  const chartTypeRef=useRef('candle'), indsRef=useRef({ma:true,ema:true,bb:true,vwap:false,ichi:false,fib:false});
  const csRef=useRef(createCS());
  const mxRef=useRef(-1), myRef=useRef(-1);
  const mainCvsRef=useRef(null), rsiCvsRef=useRef(null), macdCvsRef=useRef(null), volCvsRef=useRef(null);
  const chartContainerRef=useRef(null);
  const analysisRef=useRef(null); // scroll target

  useEffect(()=>{ activePairRef.current=activePair; },[activePair]);
  useEffect(()=>{ activeTFRef.current=activeTF; },[activeTF]);
  useEffect(()=>{ chartTypeRef.current=chartType; },[chartType]);
  useEffect(()=>{ indsRef.current=inds; },[inds]);

  // Seed candles
  useEffect(()=>{
    Object.keys(PAIRS).forEach(s=>{ livePricesRef.current[s]=PAIRS[s].base; candlesRef.current[s]=genCandles(PAIRS[s].base,150,TF_MS['4H']); });
  },[]);

  // Binance WebSocket
  useEffect(()=>{
    const syms=['btcusdt','ethusdt','solusdt','bnbusdt','xrpusdt','avaxusdt','linkusdt','arbusdt','opusdt','maticusdt','dogeusdt','injusdt'];
    let ws,retry;
    function connect(){
      try{
        ws=new WebSocket(`wss://stream.binance.com:9443/stream?streams=${syms.map(s=>`${s}@ticker`).join('/')}`);
        ws.onopen=()=>setWsStatus('LIVE');
        ws.onmessage=(e)=>{
          try{
            const d=JSON.parse(e.data).data; if(!d?.s) return;
            const sym=d.s.slice(0,-4)+'/'+d.s.slice(-4);
            if(!PAIRS[sym]) return;
            const price=parseFloat(d.c),chg=(price-parseFloat(d.o))/parseFloat(d.o)*100;
            livePricesRef.current[sym]=price;
            const src=candlesRef.current[sym];
            if(src?.length){ const last=src[src.length-1]; src[src.length-1]={...last,c:price,h:Math.max(last.h,price),l:Math.min(last.l,price)}; }
            setPrices(prev=>({...prev,[sym]:{price,change24h:chg,high24h:parseFloat(d.h),low24h:parseFloat(d.l)}}));
          }catch(_e){}
        };
        ws.onerror=()=>setWsStatus('ERR');
        ws.onclose=()=>{ setWsStatus('...'); retry=setTimeout(connect,3000); };
      }catch(_e){ setWsStatus('--'); }
    }
    connect(); return()=>{ ws?.close(); clearTimeout(retry); };
  },[]);

  // Forex + metals
  useEffect(()=>{
    const go=async()=>{
      try{
        const r=await fetch('/api/prices'),d=await r.json();
        Object.entries(d).forEach(([pair,info])=>{ if(info?.price&&PAIRS[pair]){ livePricesRef.current[pair]=info.price; setPrices(prev=>({...prev,[pair]:{price:info.price,change24h:null}})); } });
      }catch(_e){}
    };
    go(); const i=setInterval(go,15000); return()=>clearInterval(i);
  },[]);

  // Smooth tick
  useEffect(()=>{
    const cryptoPairs=new Set(['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','AVAX/USDT','LINK/USDT','ARB/USDT','OP/USDT','MATIC/USDT','DOGE/USDT','INJ/USDT']);
    const i=setInterval(()=>{
      Object.keys(PAIRS).forEach(s=>{
        if(!cryptoPairs.has(s)){ const lp=livePricesRef.current[s]||PAIRS[s].base; livePricesRef.current[s]=lp+(Math.random()-.499)*lp*0.0001; }
        const src=candlesRef.current[s]; if(!src?.length) return;
        const lp=livePricesRef.current[s]||PAIRS[s].base, last=src[src.length-1];
        src[src.length-1]={...last,c:lp,h:Math.max(last.h,lp),l:Math.min(last.l,lp)};
        if(Math.random()<0.02){ src.push({t:last.t+TF_MS[activeTFRef.current],o:lp,h:lp,l:lp,c:lp,v:Math.random()*300+50}); if(src.length>300)src.shift(); }
      });
      setPrices(p=>({...p}));
    },1500);
    return()=>clearInterval(i);
  },[]);

  // Clock
  useEffect(()=>{ const i=setInterval(()=>setClock(new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})),1000); return()=>clearInterval(i); },[]);

  // Draw loop
  const redraw=useCallback(()=>{
    const pair=activePairRef.current, src=candlesRef.current[pair], p=PAIRS[pair];
    const tip=drawChart(mainCvsRef.current,src,chartTypeRef.current,indsRef.current,p,mxRef.current,myRef.current,csRef.current);
    setTooltip(tip||'');
    const rD=calcRSI(src,14).slice(-80);
    drawSub(rsiCvsRef.current,rD,0,100,'line');
    const mD=calcMACD(src).slice(-80),hD=mD.map(m=>m?m.hist:null),hV=hD.filter(v=>v!=null),hM=Math.max(...hV.map(Math.abs),1);
    drawSub(macdCvsRef.current,hD,-hM,hM,'hist');
    const vis=src.slice(-80),vM=Math.max(...vis.map(c=>c.v),1);
    drawSub(volCvsRef.current,vis,0,vM,'vol');
  },[]);

  useEffect(()=>{ redraw(); const i=setInterval(redraw,1000); return()=>clearInterval(i); },[redraw]);

  // Isolated wheel zoom on chart container
  useEffect(()=>{
    const el=chartContainerRef.current; if(!el) return;
    const handler=(e)=>{ e.preventDefault(); e.stopPropagation(); csRef.current.scaleX=Math.max(0.2,Math.min(6,csRef.current.scaleX*(e.deltaY>0?0.85:1.18))); redraw(); };
    el.addEventListener('wheel',handler,{passive:false});
    return()=>el.removeEventListener('wheel',handler);
  },[redraw]);

  // Touch pan on chart
  useEffect(()=>{
    const el=mainCvsRef.current; if(!el) return;
    let lastX=0;
    const onStart=(e)=>{ lastX=e.touches[0].clientX; csRef.current.isDragging=true; csRef.current.dragStartOffset=csRef.current.offsetX; csRef.current.dragStartX=lastX; };
    const onMove=(e)=>{ if(!csRef.current.isDragging) return; csRef.current.offsetX=csRef.current.dragStartOffset+(e.touches[0].clientX-csRef.current.dragStartX); redraw(); };
    const onEnd=()=>{ csRef.current.isDragging=false; };
    el.addEventListener('touchstart',onStart,{passive:true});
    el.addEventListener('touchmove',onMove,{passive:true});
    el.addEventListener('touchend',onEnd);
    return()=>{ el.removeEventListener('touchstart',onStart); el.removeEventListener('touchmove',onMove); el.removeEventListener('touchend',onEnd); };
  },[redraw]);

  function getPrice(sym){ return prices[sym]?.price??livePricesRef.current[sym]??PAIRS[sym].base; }
  function getChg(sym){ return prices[sym]?.change24h??((getPrice(sym)-PAIRS[sym].base)/PAIRS[sym].base*100); }

  function switchPair(sym){
    setActivePair(sym); activePairRef.current=sym;
    csRef.current=createCS();
    candlesRef.current[sym]=genCandles(livePricesRef.current[sym]||PAIRS[sym].base,150,TF_MS[activeTFRef.current]);
    setSignal(null); setHeatmap(null); setMasterSignal(null);
    setMenuOpen(false); setWlFilter('');
    setTimeout(redraw,60);
  }

  function changeTF(tf){
    setActiveTF(tf); activeTFRef.current=tf;
    setTfOpen(false); csRef.current=createCS();
    candlesRef.current[activePairRef.current]=genCandles(livePricesRef.current[activePairRef.current]||PAIRS[activePairRef.current].base,150,TF_MS[tf]);
    setTimeout(redraw,60);
  }

  function toggleInd(ind){
    setInds(prev=>{ const n={...prev,[ind]:!prev[ind]}; indsRef.current=n; setTimeout(redraw,10); return n; });
  }

  // Mouse events for desktop
  function onMouseDown(e){ csRef.current.isDragging=true; csRef.current.dragStartX=e.clientX; csRef.current.dragStartOffset=csRef.current.offsetX; }
  function onMouseMove(e){
    if(!mainCvsRef.current) return;
    const r=mainCvsRef.current.getBoundingClientRect();
    mxRef.current=e.clientX-r.left; myRef.current=e.clientY-r.top;
    if(csRef.current.isDragging) csRef.current.offsetX=csRef.current.dragStartOffset+(e.clientX-csRef.current.dragStartX);
    redraw();
  }
  function onMouseUp(){ csRef.current.isDragging=false; }
  function onMouseLeave(){ mxRef.current=-1; myRef.current=-1; csRef.current.isDragging=false; redraw(); }

  async function runAnalysis(){
    const pair=activePairRef.current, tf=activeTFRef.current;
    const src=candlesRef.current[pair], lp=getPrice(pair);
    setAnalysing(true); setSignal(null); setHeatmap(null); setMasterSignal(null);
    // Scroll to analysis section immediately
    setTimeout(()=>{ analysisRef.current?.scrollIntoView({behavior:'smooth',block:'start'}); },100);
    try{
      const res=await fetch('/api/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candles:src,livePrice:lp,dec:PAIRS[pair].dec,pair,tf})});
      const data=await res.json();
      setSignal({...data,pair,tf});
      if(data.heatmap) setHeatmap(data.heatmap);
      if(data.masterSignal) setMasterSignal(data.masterSignal);
      // Scroll again once results arrive
      setTimeout(()=>{ analysisRef.current?.scrollIntoView({behavior:'smooth',block:'start'}); },200);
    }catch(_e){ setSignal({error:'Analysis failed - check OPENROUTER_API_KEY'}); }
    setAnalysing(false);
  }

  async function loadHistory(){
    try{ const r=await fetch('/api/signals'); const d=await r.json(); setSH(d.signals||[]); }catch(_e){}
  }

  const lp=getPrice(activePair), pr=PAIRS[activePair], chg=getChg(activePair);
  const hdr=prices[activePair];
  const vc=v=>(v==='BUY'||v==='LONG')?'#00c87a':(v==='SELL'||v==='SHORT')?'#f03060':'#f5a623';

  // - Shared style tokens -
  const C = {
    bg:'#0b0c11', bg2:'#0f1018', bg3:'#161821', border:'#1a1d2a', border2:'#2a2d3e',
    text:'#c9cce0', muted:'#4a5270', blue:'#3d7fff', green:'#00c87a', red:'#f03060',
  };

  const btn=(extra={})=>({ fontFamily:'inherit',fontSize:11,border:`1px solid ${C.border2}`,borderRadius:6,background:C.bg3,color:C.text,cursor:'pointer',padding:'8px 14px', ...extra });
  const activBtn=(active,extra={})=>({ ...btn(extra), background:active?C.blue:C.bg3, color:active?'#fff':C.muted, borderColor:active?C.blue:C.border2 });

  return(
    <div style={{background:C.bg,minHeight:'100vh',fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:C.text}}>

      {/* - MARKET SELECTOR DRAWER - */}
      {menuOpen&&(
        <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex'}}>
          <div onClick={()=>{ setMenuOpen(false); setWlFilter(''); }} style={{position:'absolute',inset:0,background:'rgba(0,0,0,.7)'}}/>
          <div style={{position:'relative',width:'min(320px,92vw)',background:C.bg2,display:'flex',flexDirection:'column',zIndex:1,height:'100%',overflowY:'hidden'}}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Markets</span>
              <button onClick={()=>{ setMenuOpen(false); setWlFilter(''); }} style={{background:'transparent',border:'none',color:C.muted,fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>
            </div>
            {/* Search */}
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <input autoFocus value={wlFilter} onChange={e=>setWlFilter(e.target.value)} placeholder="Search markets..." style={{width:'100%',background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:8,padding:'10px 12px',color:C.text,fontFamily:'inherit',fontSize:12,outline:'none'}}/>
            </div>
            {/* List */}
            <div style={{overflowY:'auto',flex:1,WebkitOverflowScrolling:'touch'}}>
              {['Crypto','L1','L2','DeFi','Meme','Forex','Commodity'].map(cat=>{
                const syms=Object.keys(PAIRS).filter(s=>PAIRS[s].cat===cat&&(!wlFilter||s.toLowerCase().includes(wlFilter.toLowerCase())));
                if(!syms.length) return null;
                return(
                  <div key={cat}>
                    <div style={{fontSize:9,color:C.blue,padding:'10px 16px 4px',letterSpacing:'1px',textTransform:'uppercase',fontWeight:700,background:C.bg3,borderBottom:`1px solid ${C.border}`}}>{cat}</div>
                    {syms.map(sym=>{
                      const lpr=getPrice(sym),ch=getChg(sym),active=sym===activePair;
                      return(
                        <div key={sym} onClick={()=>switchPair(sym)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 16px',cursor:'pointer',background:active?'rgba(61,127,255,.1)':'transparent',borderLeft:active?`3px solid ${C.blue}`:`3px solid transparent`,borderBottom:`1px solid rgba(26,29,42,.6)`}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:13,color:active?'#fff':C.text}}>{sym}</div>
                            <div style={{fontSize:10,color:C.muted,marginTop:2}}>{PAIRS[sym].cat}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:12,fontWeight:600,color:ch>=0?C.green:C.red}}>{fmt(lpr,PAIRS[sym].dec)}</div>
                            <div style={{fontSize:10,color:ch>=0?C.green:C.red}}>{ch>=0?'+':''}{ch.toFixed(2)}%</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* - HISTORY DRAWER - */}
      {historyOpen&&(
        <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex'}}>
          <div onClick={()=>setHistoryOpen(false)} style={{position:'absolute',inset:0,background:'rgba(0,0,0,.7)'}}/>
          <div style={{position:'relative',width:'min(560px,96vw)',background:C.bg2,display:'flex',flexDirection:'column',zIndex:1,height:'100%',marginLeft:'auto',overflowY:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Signal History</span>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={async()=>{ await fetch('/api/resolve',{method:'POST'}); loadHistory(); }} style={{...btn(),fontSize:10,padding:'6px 10px',color:'#f5a623',borderColor:'rgba(245,166,35,.3)'}}>Resolve</button>
                <button onClick={async()=>{ await fetch('/api/recalculate-weights',{method:'POST'}); loadHistory(); }} style={{...btn(),fontSize:10,padding:'6px 10px',color:'#9b7ff5',borderColor:'rgba(155,127,245,.3)'}}>Recalc Weights</button>
                <button onClick={()=>setHistoryOpen(false)} style={{background:'transparent',border:'none',color:C.muted,fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>
              </div>
            </div>
            <div style={{overflowY:'auto',flex:1,WebkitOverflowScrolling:'touch'}}>
              {signalHistory.length===0&&(
                <div style={{padding:32,textAlign:'center',color:C.muted,fontSize:12,lineHeight:2}}>No signals yet.<br/>Run AI Analysis on any pair.</div>
              )}
              {signalHistory.map((s,i)=>{
                const ac=s.final_action==='LONG'?C.green:s.final_action==='SHORT'?C.red:'#6b7280';
                const oc=s.outcome==='TP_HIT'?C.green:s.outcome==='SL_HIT'?C.red:s.status==='OPEN'?'#f5a623':'#6b7280';
                return(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:`1px solid #131520`,flexWrap:'wrap'}}>
                    <div style={{width:50,flexShrink:0}}>
                      <div style={{fontWeight:700,color:ac,fontSize:12}}>{s.final_action}</div>
                      <div style={{fontSize:10,color:C.muted}}>{s.timeframe}</div>
                    </div>
                    <div style={{flex:1,minWidth:80}}>
                      <div style={{fontWeight:600,color:C.text,fontSize:12}}>{s.symbol}</div>
                      <div style={{fontSize:10,color:C.muted}}>{s.created_at?.slice(0,16)}</div>
                    </div>
                    <div style={{fontSize:10,color:C.muted,flexShrink:0}}>
                      {s.entry_price&&<span>E:{Number(s.entry_price).toFixed(4)} </span>}
                      {s.risk_reward&&<span style={{color:'#9b7ff5'}}>RR:{Number(s.risk_reward).toFixed(1)} </span>}
                      {s.final_conviction&&<span>Conv:{Math.round(s.final_conviction*100)}%</span>}
                    </div>
                    <div style={{flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:10,padding:'3px 8px',borderRadius:4,background:`${oc}18`,border:`1px solid ${oc}35`,color:oc}}>{s.outcome||s.status}</span>
                      {s.pnl_r!=null&&<span style={{fontSize:11,fontWeight:700,color:s.pnl_r>=0?C.green:C.red}}>{s.pnl_r>=0?'+':''}{Number(s.pnl_r).toFixed(1)}R</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* -
          TOP BAR - fixed, always visible
      - */}
      <div style={{position:'sticky',top:0,zIndex:100,background:C.bg2,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',height:52,gap:0}}>

        {/* Hamburger - mobile only, hidden on desktop via CSS */}
        <button onClick={()=>setMenuOpen(true)} className="mob-only" style={{width:52,height:52,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:5,background:'transparent',border:'none',borderRight:`1px solid ${C.border}`,cursor:'pointer',flexShrink:0}}>
          {[0,1,2].map(i=><div key={i} style={{width:20,height:2,background:C.text,borderRadius:1}}/>)}
        </button>

        {/* Logo */}
        <div style={{padding:'0 14px',fontSize:13,fontWeight:700,color:'#fff',borderRight:`1px solid ${C.border}`,height:'100%',display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap',flexShrink:0}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:C.blue}}/>
          <span>SignalAI</span>
        </div>

        {/* Active pair + price - tapping opens menu on mobile */}
        <div style={{padding:'0 12px',display:'flex',alignItems:'center',gap:8,height:'100%',borderRight:`1px solid ${C.border}`,flexShrink:0,cursor:'pointer'}} onClick={()=>setMenuOpen(true)}>
          <span style={{fontSize:12,fontWeight:700,color:'#fff'}}>{activePair}</span>
          <span style={{fontSize:16,fontWeight:700,color:chg>=0?C.green:C.red}}>{fmt(lp,pr.dec)}</span>
          <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:chg>=0?'rgba(0,200,122,.12)':'rgba(240,48,96,.12)',color:chg>=0?C.green:C.red,fontWeight:600,whiteSpace:'nowrap'}}>{chg>=0?'+':''}{chg.toFixed(2)}%</span>
        </div>

        {/* Desktop pair tabs - hidden on mobile via CSS */}
        <div className="desk-only" style={{display:'flex',overflowX:'auto',height:'100%',borderRight:`1px solid ${C.border}`}}>
          {['BTC/USDT','ETH/USDT','XAU/USD','EUR/USD','GBP/USD','SOL/USDT'].map(sym=>{
            const ch=getChg(sym);
            return(
              <div key={sym} onClick={()=>switchPair(sym)} style={{padding:'0 12px',cursor:'pointer',whiteSpace:'nowrap',height:'100%',display:'flex',alignItems:'center',gap:6,borderRight:`1px solid ${C.border}`,borderBottom:activePair===sym?`2px solid ${C.blue}`:'2px solid transparent',background:activePair===sym?C.bg3:'transparent',fontSize:10,flexShrink:0}}>
                <span style={{fontWeight:700,color:activePair===sym?'#fff':C.text}}>{sym.split('/')[0]}</span>
                <span style={{fontSize:9,padding:'1px 4px',borderRadius:2,background:ch>=0?'rgba(0,200,122,.15)':'rgba(240,48,96,.15)',color:ch>=0?C.green:C.red}}>{ch>=0?'+':''}{ch.toFixed(2)}%</span>
              </div>
            );
          })}
        </div>

        {/* Right side - TF + History + AI always visible on all screens */}
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'0 10px',marginLeft:'auto',flexShrink:0}}>

          {/* TF dropdown */}
          <div style={{position:'relative'}}>
            <button onClick={()=>setTfOpen(o=>!o)} style={{fontFamily:'inherit',fontSize:11,padding:'6px 10px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.bg3,color:C.blue,cursor:'pointer',fontWeight:700,display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
              {activeTF} <span style={{fontSize:9,color:C.muted}}>{tfOpen?'▲':'▼'}</span>
            </button>
            {tfOpen&&(
              <div style={{position:'absolute',top:'110%',right:0,background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:8,zIndex:300,padding:8,display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,minWidth:120,boxShadow:'0 8px 32px rgba(0,0,0,.8)'}}>
                {TFS.map(tf=>(
                  <button key={tf} onClick={()=>changeTF(tf)} style={{fontFamily:'inherit',fontSize:12,padding:'9px 10px',border:'none',borderRadius:5,background:tf===activeTF?C.blue:'transparent',color:tf===activeTF?'#fff':C.text,cursor:'pointer',fontWeight:tf===activeTF?700:400,textAlign:'center'}}>
                    {tf}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* History */}
          <button onClick={()=>{ setHistoryOpen(true); loadHistory(); }} style={{fontFamily:'inherit',fontSize:11,padding:'6px 12px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.bg3,color:C.text,cursor:'pointer',whiteSpace:'nowrap'}}>
            History
          </button>

          {/* AI Analysis */}
          <button onClick={runAnalysis} disabled={analysing} style={{fontFamily:'inherit',fontSize:11,padding:'6px 14px',borderRadius:6,border:'none',background:analysing?C.bg3:'linear-gradient(135deg,#3d7fff,#9b7ff5)',color:analysing?C.muted:'#fff',cursor:analysing?'default':'pointer',fontWeight:700,whiteSpace:'nowrap',boxShadow:analysing?'none':'0 0 16px rgba(61,127,255,.35)'}}>
            {analysing?'...':'AI Analysis'}
          </button>
        </div>
      </div>
      {/* Close dropdowns when clicking outside */}
     {tfOpen&&<div onClick={()=>setTfOpen(false)} style={{position:'fixed',inset:0,zIndex:99}}/>}

      {/* -
          CHART TOOLBAR - below top bar, scrollable horizontally
      - */}
      <div style={{display:'flex',alignItems:'center',gap:0,background:C.bg2,borderBottom:`1px solid ${C.border}`,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>

        {/* Chart type */}
        {[['candle','Candles'],['line','Line'],['heikin','H-Ashi']].map(([ct,lbl])=>(
          <button key={ct} onClick={()=>{ setChartType(ct); chartTypeRef.current=ct; setTimeout(redraw,10); }} style={{height:36,padding:'0 12px',background:'transparent',border:'none',borderBottom:chartType===ct?`2px solid ${C.blue}`:'2px solid transparent',color:chartType===ct?C.blue:C.muted,cursor:'pointer',fontFamily:'inherit',fontSize:10,fontWeight:chartType===ct?700:400,whiteSpace:'nowrap',flexShrink:0}}>
            {lbl}
          </button>
        ))}

        <div style={{width:1,height:20,background:C.border,margin:'0 4px',flexShrink:0}}/>

        {/* Indicators - compact pills */}
        {['MA','EMA','BB','VWAP','ICHI','FIB'].map(ind=>{
          const on=inds[ind.toLowerCase()];
          return(
            <button key={ind} onClick={()=>toggleInd(ind.toLowerCase())} style={{height:36,padding:'0 10px',background:'transparent',border:'none',color:on?C.blue:C.muted,cursor:'pointer',fontFamily:'inherit',fontSize:10,fontWeight:on?700:400,whiteSpace:'nowrap',flexShrink:0,borderBottom:on?`2px solid ${C.blue}`:'2px solid transparent'}}>
              {ind}
            </button>
          );
        })}

        <div style={{marginLeft:'auto',padding:'0 10px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:wsStatus==='LIVE'?C.green:'#f5a623'}}/>
            <span style={{fontSize:9,color:wsStatus==='LIVE'?C.green:'#f5a623'}}>{wsStatus}</span>
            <span style={{fontSize:9,color:C.muted}}>{clock}</span>
          </div>
        </div>
      </div>

      {/* -
          PRICE STATS BAR - scrollable
      - */}
      <div style={{display:'flex',alignItems:'center',gap:0,background:C.bg2,borderBottom:`1px solid ${C.border}`,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
        {[
          ['High', hdr?.high24h?fmt(hdr.high24h,pr.dec):'--'],
          ['Low',  hdr?.low24h?fmt(hdr.low24h,pr.dec):'--'],
          ['Vol',  pr.vol],
          ['OI',   pr.oi],
          ['Liq',  pr.liq],
        ].map(([label,val])=>(
          <div key={label} style={{padding:'6px 14px',borderRight:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{fontSize:9,color:C.muted,marginBottom:1}}>{label}</div>
            <div style={{fontSize:10,color:C.text,fontWeight:500}}>{val}</div>
          </div>
        ))}
      </div>

      {/* -
          MAIN CHART
      - */}
      <div ref={chartContainerRef} style={{position:'relative',background:C.bg,touchAction:'pan-x'}}>
        {/* Canvas - 60vw height on desktop, 55vw on mobile, min 260px */}
        <div style={{position:'relative',width:'100%',paddingTop:'min(55vw,380px)',minHeight:260,overflow:'hidden'}}>
          <canvas ref={mainCvsRef}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',cursor:'crosshair',display:'block'}}/>
          {tooltip&&<div style={{position:'absolute',top:6,left:70,fontSize:9,color:'#6a7090',pointerEvents:'none',background:'rgba(11,12,17,.9)',padding:'2px 8px',borderRadius:3,zIndex:5,whiteSpace:'nowrap',maxWidth:'90%',overflow:'hidden',textOverflow:'ellipsis'}}>{tooltip}</div>}
        </div>

        {/* Sub charts */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',borderTop:`1px solid ${C.border}`,background:C.bg}}>
          {[['RSI (14)',rsiCvsRef],['MACD',macdCvsRef],['Volume',volCvsRef]].map(([lbl,ref],i)=>(
            <div key={lbl} style={{position:'relative',height:72,borderRight:i<2?`1px solid ${C.border}`:'none'}}>
              <div style={{position:'absolute',top:3,left:6,fontSize:9,color:C.muted,zIndex:2,pointerEvents:'none'}}>{lbl}</div>
              <canvas ref={ref} style={{display:'block',width:'100%',height:'100%'}}/>
            </div>
          ))}
        </div>
      </div>

      {/* -
          ANALYSIS SECTION - scrollable, below chart
      - */}
      <div ref={analysisRef} style={{background:C.bg,borderTop:`2px solid ${C.border2}`}}>

        {/* Loading state */}
        {analysing&&(
          <div style={{padding:'20px 16px',textAlign:'center'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
              {['Technical','Sentiment','Structure','Liquidity'].map(m=>(
                <div key={m} style={{fontSize:10,padding:'5px 10px',borderRadius:4,background:C.bg3,border:`1px solid ${C.border2}`,color:C.muted}}>{m}</div>
              ))}
            </div>
            <div style={{fontSize:11,color:C.muted}}>Orchestrating 4 specialists in parallel...</div>
          </div>
        )}

        {/* Heatmap */}
        {heatmap&&(
          <div style={{padding:'12px 12px 0'}}>
            <Heatmap heatmap={heatmap} masterSignal={masterSignal} dec={pr.dec} onClose={()=>{ setHeatmap(null); setMasterSignal(null); setSignal(null); }}/>
          </div>
        )}

        {/* Model cards */}
        {signal?.models?.length>0&&heatmap&&(
          <div style={{padding:'0 12px 12px'}}>
            <ModelCards models={signal.models} vc={vc}/>
          </div>
        )}

        {/* Legacy (no API key) */}
        {signal&&!heatmap&&(
          <div style={{padding:'12px'}}>
            <LegacyPanel signal={signal} dec={pr.dec} onClose={()=>setSignal(null)} vc={vc}/>
          </div>
        )}
      </div>

      {/* Bottom padding for mobile */}
      <div style={{height:24}}/>

     <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        body{margin:0;background:#0b0c11;overscroll-behavior-y:contain}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#2a2d3e;border-radius:2px}
        input::placeholder{color:#3a3f5c}
        canvas{touch-action:none}
        .mob-only{display:flex}
        .desk-only{display:none}
        @media(min-width:768px){
          .mob-only{display:none !important}
          .desk-only{display:flex !important}
        }
      `}</style>
    </div>
  );
}

// - Model Cards -
function ModelCards({models,vc}){
  if(!models?.length) return null;
  const C={bg3:'#161821',border:'#1a1d2a',muted:'#4a5270',text:'#c9cce0'};
  return(
    <div>
      <div style={{fontSize:9,color:C.muted,marginBottom:8,textTransform:'uppercase',letterSpacing:'1px',fontWeight:700}}>Specialist outputs</div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(models.length,3)},1fr)`,gap:8}}>
        {models.map((m)=>(
          <div key={m.id} style={{background:C.bg3,borderRadius:8,padding:'10px',borderTop:`2px solid ${m.color}`,border:`1px solid ${m.color}20`}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:7}}>
              <div style={{width:20,height:20,borderRadius:4,background:m.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#000',flexShrink:0}}>{m.icon}</div>
              <span style={{fontSize:10,fontWeight:700,color:C.text}}>{m.name}</span>
            </div>
            {m.error
              ?<div style={{fontSize:10,color:'#f03060'}}>Unavailable</div>
              :<>
                <div style={{fontSize:15,fontWeight:700,color:vc(m.verdict),marginBottom:3}}>{m.verdict}</div>
                <div style={{background:'#1a1d2a',borderRadius:2,height:3,marginBottom:4,overflow:'hidden'}}>
                  <div style={{height:'100%',width:m.confidence+'%',background:vc(m.verdict),borderRadius:2}}/>
                </div>
                <div style={{fontSize:9,color:C.muted,marginBottom:5}}>{m.confidence}%</div>
                <div style={{fontSize:9,color:C.text,lineHeight:1.6,marginBottom:4}}>{m.narrative}</div>
                {m.key_risk&&m.key_risk!=='None flagged'&&<div style={{fontSize:9,padding:'3px 6px',borderRadius:3,background:'rgba(240,48,96,.06)',border:'1px solid rgba(240,48,96,.18)',color:'#f03060'}}>Risk: {m.key_risk}</div>}
              </>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// - Legacy Panel (no API key) -
function LegacyPanel({signal,dec,onClose,vc}){
  const {local,error}=signal;
  const fmt2=(n,d)=>Number(n).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
  const C={bg3:'#161821',border:'#1a1d2a',muted:'#4a5270',text:'#c9cce0',border2:'#2a2d3e'};
  if(error&&!local) return <div style={{padding:14,color:'#f03060',fontSize:11,borderRadius:8,background:C.bg3,border:`1px solid rgba(240,48,96,.2)`}}>{error}</div>;
  const lvl=local?.levels, topV=local?.verdict;
  return(
    <div style={{background:C.bg3,borderRadius:10,padding:14,border:`1px solid ${C.border2}`}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
        <span style={{fontSize:15,fontWeight:700,padding:'4px 14px',borderRadius:5,background:`${vc(topV)}18`,border:`1px solid ${vc(topV)}40`,color:vc(topV)}}>{topV}</span>
        <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>{signal.pair}</span>
        <span style={{fontSize:10,color:C.muted}}>{signal.tf}</span>
        <button onClick={onClose} style={{marginLeft:'auto',fontFamily:'inherit',fontSize:11,padding:'4px 10px',border:`1px solid ${C.border2}`,borderRadius:4,background:'transparent',color:C.muted,cursor:'pointer'}}>-</button>
      </div>
      {lvl&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          {[{label:'Entry',price:lvl.entry,color:'#3d7fff'},{label:'Stop Loss',price:lvl.sl,color:'#f03060'},{label:'TP 1',price:lvl.tp1,color:'#00c87a'},{label:'TP 2',price:lvl.tp2,color:'#00c87a'},{label:'TP 3',price:lvl.tp3,color:'#00c87a'}].map(row=>(
            <div key={row.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',borderRadius:5,background:`${row.color}0d`,border:`1px solid ${row.color}25`}}>
              <span style={{fontSize:10,color:C.muted}}>{row.label}</span>
              <span style={{fontWeight:700,color:row.color,fontSize:11}}>{fmt2(row.price,dec)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:9,color:'#252840',marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`}}>Add OPENROUTER_API_KEY for full 4-model analysis.</div>
    </div>
  );
}
