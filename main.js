(() => {
  // ---------- Canvas ----------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let W=0,H=0, DPR=Math.max(1, Math.min(2, window.devicePixelRatio||1));
  function resize(){
    const b=canvas.parentElement.getBoundingClientRect();
    W=Math.floor(b.width); H=Math.floor(b.height);
    canvas.width=Math.floor(W*DPR); canvas.height=Math.floor(H*DPR);
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
  }
  window.addEventListener('resize', resize); resize();

  // ---------- UI ----------
  const $ = id=>document.getElementById(id);
  const ui = {
  grid: $('grid'), grav: $('grav'), drag: $('drag'), vort: $('vort'),
  pulseAmp: $('pulseAmp'), pulseRad: $('pulseRad'), pulseLife: $('pulseLife'), vortexBoost: $('vortexBoost'),
  nCircles: $('nCircles'), nBoxes: $('nBoxes'), nSlits: $('nSlits'), size: $('size'),
  gen: $('gen'), clear: $('clear'), pauseBtn: $('pauseBtn'), resetBtn: $('resetBtn'),
  showGrid: $('showGrid')
};
  const setLabel=(id,v)=>{ const el = $(`${id}Val`); if (el) el.textContent = v; };
  function sync() {
  const get = (el, fmt = v => v) => el ? fmt(el.value) : '';
  setLabel('grid', get(ui.grid));
  setLabel('grav', get(ui.grav, v => (+v).toFixed(2)));
  setLabel('drag', get(ui.drag, v => (+v).toFixed(3)));
  setLabel('vort', get(ui.vort, v => (+v).toFixed(1)));
  setLabel('pulseAmp', get(ui.pulseAmp, v => (+v).toFixed(1)));
  setLabel('pulseRad', get(ui.pulseRad));
  setLabel('pulseLife', get(ui.pulseLife, v => (+v).toFixed(2)));
  setLabel('vortexBoost', get(ui.vortexBoost, v => (+v).toFixed(2)));

  const deg = ui.cone ? +ui.cone.value : 45;
  setLabel('cone', `${deg}°`);

  setLabel('nCircles', get(ui.nCircles));
  setLabel('nBoxes', get(ui.nBoxes));
  setLabel('nSlits', get(ui.nSlits));
  setLabel('size', get(ui.size));
}

  Object.values(ui).forEach(el=>{ if(el && el.tagName==='INPUT' && el.type==='range') el.addEventListener('input', sync); });

  // ---------- Grid / Fields (Shallow Water: height h, velocities ux, uy) ----------
  let nx=+ui.grid.value, ny=0, N=0; let h, ux, uy, obstacles;
  function id(x,y){ return y*nx+x; }
  function alloc(){
    nx=+ui.grid.value; ny=Math.max(48, Math.round(nx*(canvas.height/canvas.width))); N=nx*ny;
    h=new Float32Array(N); ux=new Float32Array(N); uy=new Float32Array(N); obstacles=new Uint8Array(N);
  }
  alloc(); ui.grid.addEventListener('change', alloc);

  // ---------- Obstacles ----------
  function clearObs(){ obstacles.fill(0); }
  function randInt(a,b){ return a+Math.floor(Math.random()*(b-a+1)); }
  function placeCircle(cx,cy,rad){ const r2=rad*rad; for(let y=Math.max(1,cy-rad);y<Math.min(ny-1,cy+rad);y++){ for(let x=Math.max(1,cx-rad);x<Math.min(nx-1,cx+rad);x++){ const dx=x-cx,dy=y-cy; if(dx*dx+dy*dy<=r2) obstacles[id(x,y)]=1; } } }
  function placeBox(cx,cy,hw,hh){ for(let y=Math.max(1,cy-hh);y<Math.min(ny-1,cy+hh);y++){ for(let x=Math.max(1,cx-hw);x<Math.min(nx-1,cx+hw);x++){ obstacles[id(x,y)]=1; } } }
  function placeSlit(cx,cy,len,gap){ const half=len>>1,th=2; for(let y=cy-th;y<=cy+th;y++){ for(let x=cx-half;x<=cx+half;x++){ if(Math.abs(x-cx)<=gap) continue; if(x>1&&x<nx-1&&y>1&&y<ny-1) obstacles[id(x,y)]=1; } } }
  function generateShapes(){ clearObs(); const pad=10,S=+ui.size.value; for(let i=0;i<+ui.nCircles.value;i++) placeCircle(randInt(pad,nx-pad),randInt(pad,ny-pad),randInt(Math.max(3,S-6),S+5)); for(let i=0;i<+ui.nBoxes.value;i++) placeBox(randInt(pad,nx-pad),randInt(pad,ny-pad),randInt(Math.max(3,S-6),S+6),randInt(Math.max(3,S-6),S+6)); for(let i=0;i<+ui.nSlits.value;i++) placeSlit(randInt(pad+12,nx-12-pad),randInt(pad+6,ny-6-pad),randInt(20,Math.max(30,S*3)),randInt(1,Math.max(2,S>>2))); }
  ui.gen.addEventListener('click', generateShapes); ui.clear.addEventListener('click', clearObs);

  // ---------- Emission: click-drag directional cone pulse + right-click radial ----------
  let dragStart = null, lastDraw = null, isDrawing = false;
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  function toGrid(px,py){ const gx=Math.floor(px/W*nx), gy=Math.floor(py/H*ny); return {gx:Math.max(1,Math.min(nx-2,gx)), gy:Math.max(1,Math.min(ny-2,gy))}; }

  function smoothstep(edge0, edge1, x){ const t=Math.min(1,Math.max(0,(x-edge0)/(edge1-edge0))); return t*t*(3-2*t); }

  function emitRadial(gx,gy,strength,rad){
    const pulseRad = Math.max(1, +ui.pulseRad.value);
    const i = id(gx, gy);
    if (obstacles[i]) return;
    h[i] += strength * 120.0 * pulseRad;
    const n = 64;
    for (let k = 0; k < n; k++) {
      const angle = (2 * Math.PI * k) / n;
      ux[i] += (strength * 32.0 * pulseRad / n) * Math.cos(angle);
      uy[i] += (strength * 32.0 * pulseRad / n) * Math.sin(angle);
    }
  }

  function emitFreeDraw(gx, gy, velx, vely, strength) {
  const velMag = Math.hypot(velx, vely);
  const pulseRad = Math.max(1, +ui.pulseRad.value);
  const speedBoost = Math.max(1, velMag * 8 * pulseRad);
  const i = id(gx, gy);
  if (obstacles[i]) return;
  h[i] += strength * velMag * speedBoost * 0.12;
  ux[i] += strength * 60.0 * velx * speedBoost;
  uy[i] += strength * 60.0 * vely * speedBoost;
  const swirl = strength * 30.0 * velMag * speedBoost;
  const perpX = -vely, perpY = velx;
  ux[i] += swirl * (-perpY);
  uy[i] += swirl * (perpX);
  }

  canvas.addEventListener('mousedown',e=>{
    let rect=canvas.getBoundingClientRect();
    let mouseX=e.clientX-rect.left, mouseY=e.clientY-rect.top;
    if(e.button===2){ const c=toGrid(mouseX,mouseY); emitRadial(c.gx,c.gy, +ui.pulseAmp.value, +ui.pulseRad.value); return; }
    if(e.button!==0) return;
    dragStart={x:mouseX,y:mouseY};
    lastDraw={x:mouseX,y:mouseY};
    isDrawing=true;
  });

  window.addEventListener('mouseup',e=>{
    isDrawing=false;
    dragStart=null;
    lastDraw=null;
  });

  canvas.addEventListener('mousemove', e => {
    if (!isDrawing || !lastDraw) return;
    let rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const prev = lastDraw;
    const dx = mouseX - prev.x, dy = mouseY - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.5) { // threshold to avoid noise
      const steps = Math.max(1, Math.floor(dist));
      for (let i = 1; i <= steps; i++) {
        const frac = i / steps;
        const interpX = prev.x + dx * frac;
        const interpY = prev.y + dy * frac;
        const velx = dx / dist;
        const vely = dy / dist;
        const c = toGrid(interpX, interpY);
        emitFreeDraw(c.gx, c.gy, velx, vely, +ui.pulseAmp.value * Math.min(3, dist/10));
      }
    }
    lastDraw = {x: mouseX, y: mouseY};
  });

  // ---------- Physics step (linearized shallow water + vorticity confinement) ----------
  const dt=1/60;
  let paused=false; ui.pauseBtn.addEventListener('click',()=>{ paused=!paused; ui.pauseBtn.textContent=paused?'Resume':'Pause'; });
  ui.resetBtn.addEventListener('click',()=>{ h.fill(0); ux.fill(0); uy.fill(0); });

  function step(){
  const g=+ui.grav.value, drag=+ui.drag.value, vortK=+ui.vort.value;
  const pulseLife = +ui.pulseLife.value;
  const vortexBoost = +ui.vortexBoost.value;
  // Apply pulse life decay to all fields
    const hN=new Float32Array(N), uxN=new Float32Array(N), uyN=new Float32Array(N);

    // compute updates
    for(let y=1;y<ny-1;y++){
      const base=y*nx;
      for(let x=1;x<nx-1;x++){
        const i=base+x;
        if(obstacles[i]){ hN[i]=0; uxN[i]=0; uyN[i]=0; continue; }
        const dhdx = (h[i]-h[i-1]);
        const dhdy = (h[i]-h[i-nx]);
        let u=ux[i], v=uy[i];
        // momentum update: pressure gradient + drag + pulse life decay
        let uNew = (u - dt*(g*dhdx) - drag*u) * Math.exp(-dt/pulseLife);
        let vNew = (v - dt*(g*dhdy) - drag*v) * Math.exp(-dt/pulseLife);
        uxN[i]=uNew; uyN[i]=vNew;
        // continuity (height) using divergence of velocity + pulse life decay
        const du = (ux[i+1]-ux[i]);
        const dv = (uy[i+nx]-uy[i]);
        hN[i] = (h[i] - dt*(du + dv)) * Math.exp(-dt/pulseLife);
      }
    }
    for(let y=1;y<ny-1;y++){
      for(let x=1;x<nx-1;x++){
        const i=id(x,y);
        if(obstacles[i]){

          if(!obstacles[i-1]) uxN[i-1] = -uxN[i-1];
          if(!obstacles[i+1]) uxN[i+1] = -uxN[i+1];
          if(!obstacles[i-nx]) uyN[i-nx] = -uyN[i-nx];
          if(!obstacles[i+nx]) uyN[i+nx] = -uyN[i+nx];
          if(!obstacles[i-1]) hN[i-1] = -hN[i-1];
          if(!obstacles[i+1]) hN[i+1] = -hN[i+1];
          if(!obstacles[i-nx]) hN[i-nx] = -hN[i-nx];
          if(!obstacles[i+nx]) hN[i+nx] = -hN[i+nx];
        }
      }
    }

    for(let y=1;y<ny-1;y++){ for(let x=1;x<nx-1;x++){ const i=id(x,y); if(obstacles[i]){ hN[i]=0; uxN[i]=0; uyN[i]=0; if(!obstacles[i-1]) uxN[i-1]=Math.min(0,uxN[i-1]); if(!obstacles[i+1]) uxN[i+1]=Math.max(0,uxN[i+1]); if(!obstacles[i-nx]) uyN[i-nx]=Math.min(0,uyN[i-nx]); if(!obstacles[i+nx]) uyN[i+nx]=Math.max(0,uyN[i+nx]); } } }

    if(vortK>0){
      const omega=new Float32Array(N);
      for(let y=1;y<ny-1;y++){ for(let x=1;x<nx-1;x++){ const i=id(x,y); omega[i]=0.5*((uy[i+1]-uy[i-1]) - (ux[i+nx]-ux[i-nx])); }}
      for(let y=2;y<ny-2;y++){
        for(let x=2;x<nx-2;x++){
          const i=id(x,y); if(obstacles[i]) continue;
          const Nx = Math.abs(omega[i+1])-Math.abs(omega[i-1]);
          const Ny = Math.abs(omega[i+nx])-Math.abs(omega[i-nx]);
          const grad = Math.hypot(Nx,Ny);
          const len=grad+1e-6; const NxN=Nx/len, NyN=Ny/len; 
          const boost = 1 + vortexBoost * Math.min(1, grad/2.0);
          uxN[i] += dt*vortK*NyN*omega[i]*boost;
          uyN[i] += -dt*vortK*NxN*omega[i]*boost;
        }
      }
    }

    h=hN; ux=uxN; uy=uyN;
  }

  // ---------- Rendering (color by flow direction; brightness by height) ----------
  function hsv2rgb(h,s,v){ const i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s); switch(i%6){case 0:return [v,t,p];case 1:return [q,v,p];case 2:return [p,v,t];case 3:return [p,q,v];case 4:return [t,p,v];case 5:return [v,p,q];} }
  function render(){
    const imgW=nx, imgH=ny;
    let imageData = ctx.createImageData(imgW,imgH);
    let data = imageData.data;
    const debug = document.getElementById('debugColors')?.checked;
    let omega;
    if (debug) {
      omega = new Float32Array(N);
      for(let i=0;i<N;i++){
        const x = i % nx, y = Math.floor(i / nx);
        if(x<1||x>=nx-1||y<1||y>=ny-1) continue;
        omega[i]=0.5*((uy[id(x+1,y)]-uy[id(x-1,y)]) - (ux[id(x,y+1)]-ux[id(x,y-1)]));
      }
    }
    for(let i=0;i<N;i++){
      const x = i % nx, y = Math.floor(i / nx);
      if(x<1||x>=nx-1||y<1||y>=ny-1) continue;
      if(obstacles[i]){
        const p=4*(y*imgW+x);
        data[p]=36; data[p+1]=48; data[p+2]=72; data[p+3]=255;
        if(
          !obstacles[id(x-1,y)] || !obstacles[id(x+1,y)] ||
          !obstacles[id(x,y-1)] || !obstacles[id(x,y+1)]
        ) {
          data[p]=70; data[p+1]=110; data[p+2]=180; data[p+3]=255;
        }
        continue;
      }
      if (debug) {
        const v = omega[i];
        const u = ux[i], vv = uy[i];
        const velMag = Math.hypot(u,vv);
        let r = 0, g = 0, b = 0;
        const scale = 255;
        if (v > 0) {
          r = Math.min(scale, Math.abs(v)*scale*10);
        } else if (v < 0) {
          b = Math.min(scale, Math.abs(v)*scale*10);
        }
        g = Math.min(scale, velMag*scale*0.7);
        const p=4*(y*imgW+x);
        data[p]=r; data[p+1]=g; data[p+2]=b; data[p+3]=255;
        continue;
      }
      const u=ux[i], v=uy[i];
      const mag=Math.hypot(u,v);
      let hue=((Math.atan2(v,u)/(2*Math.PI))+1)%1;
      if (Math.abs(h[i]) > 0.02) {
        hue += h[i] > 0 ? 0.08 : -0.08;
      }
      hue = Math.max(0, Math.min(1, hue));
      const val = Math.max(0, Math.min(1, 0.95 * Math.min(1, Math.abs(h[i])*1.5 + mag*0.4)));
      const sat = Math.max(0, Math.min(1, 0.35));
      let rgb = hsv2rgb(hue, sat, val);
      if (!rgb || !Array.isArray(rgb) || rgb.length !== 3) rgb = [220,220,220];
      const [r,g,b] = rgb;
      const p=4*(y*imgW+x);
      data[p]=Math.round(r*220);
      data[p+1]=Math.round(g*220);
      data[p+2]=Math.round(b*220);
      data[p+3]=255;
    }
    ctx.imageSmoothingEnabled=true; ctx.putImageData(imageData,0,0); ctx.save(); ctx.scale(canvas.width/imgW, canvas.height/imgH); ctx.drawImage(canvas,0,0); ctx.restore();

    ctx.save();
    ctx.scale(canvas.width/nx, canvas.height/ny);
    for(let i=0;i<N;i+=2){ // step by 2 for fewer draws
      const x = i % nx, y = Math.floor(i / nx);
      if(x<1||x>=nx-1||y<1||y>=ny-1) continue;
      if(obstacles[i]){
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x+0.5, y+0.5, 0.7, 0, 2*Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = 'rgb(36,48,72)';
        ctx.beginPath();
        ctx.arc(x+0.5, y+0.5, 0.6, 0, 2*Math.PI);
        ctx.fill();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = 'rgba(180,220,255,0.7)';
        ctx.beginPath();
        ctx.arc(x+0.3, y+0.2, 0.18, 0, 2*Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }
    ctx.restore();

    if(ui.showGrid.checked){ ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1; const dx=canvas.width/nx, dy=canvas.height/ny; for(let x=1;x<nx;x++){ ctx.beginPath(); ctx.moveTo(x*dx,0); ctx.lineTo(x*dx,canvas.height); ctx.stroke(); } for(let y=1;y<ny;y++){ ctx.beginPath(); ctx.moveTo(0,y*dy); ctx.lineTo(canvas.width,y*dy); ctx.stroke(); } ctx.restore(); }
  }

  // ---------- Main Loop ----------
  let last=performance.now();
  let frameCount = 0, lastFpsUpdate = performance.now(), fps = 0;
  function loop(now){
    requestAnimationFrame(loop);
    const dtSim=(now-last)/1000; last=now;
    frameCount++;
    if (now - lastFpsUpdate > 500) {
      fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      frameCount = 0;
      lastFpsUpdate = now;
    }
    if(!paused){ let acc=dtSim; const fixed=1/60; const cap=4; let n=0; while(acc>fixed && n<cap){ step(); acc-=fixed; n++; } if(n===0) step(); }
    render();
    // Draw FPS overlay
    ctx.save();
    ctx.scale(DPR, DPR);
    ctx.font = 'bold 16px Segoe UI, Arial';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(12, 12, 56, 26);
    ctx.fillStyle = '#e8f0ff';
    ctx.fillText(fps + ' fps', 20, 30);
    ctx.restore();
  }
  requestAnimationFrame(loop);

  generateShapes();
})();