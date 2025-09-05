const canvas = document.getElementById('canvas');
const wave = new window.WaveGL(canvas, { gridSize: 1080 });

// Store simulation parameters
function getInitialSimParams() {
  return {
    gridSize: parseInt(document.getElementById('grid').value),
    gravity: parseFloat(document.getElementById('grav').value),
    drag: parseFloat(document.getElementById('drag').value),
    vorticity: parseFloat(document.getElementById('vort').value),
    pulseAmp: parseFloat(document.getElementById('pulseAmp').value),
    pulseRad: parseFloat(document.getElementById('pulseRad').value),
    nCircles: parseInt(document.getElementById('nCircles').value),
    nBoxes: parseInt(document.getElementById('nBoxes').value),
    nSlits: parseInt(document.getElementById('nSlits').value),
    size: parseInt(document.getElementById('size').value),
    damping: parseFloat(document.getElementById('damping').value),
    lifetime: parseFloat(document.getElementById('lifetime').value)
  };
}
const simParams = getInitialSimParams();

// Update simulation parameters from sliders
function updateParam(id, key, parse = parseFloat) {
  const el = document.getElementById(id);
  const val = document.getElementById(id + 'Val');
  if (el && val) {
    el.addEventListener('input', () => {
      simParams[key] = parse(el.value);
      val.textContent = el.value;
      // Grid size change: recreate simulation
      if (key === 'gridSize') {
        wave.gridSize = simParams.gridSize;
        wave._initState(simParams);
      }
    });
  }
}
updateParam('grid', 'gridSize', parseInt);
updateParam('grav', 'gravity');
updateParam('drag', 'drag');
updateParam('vort', 'vorticity');
updateParam('pulseAmp', 'pulseAmp');
updateParam('pulseRad', 'pulseRad');
updateParam('nCircles', 'nCircles', parseInt);
updateParam('nBoxes', 'nBoxes', parseInt);
updateParam('nSlits', 'nSlits', parseInt);
updateParam('size', 'size', parseInt);
updateParam('damping', 'damping');
updateParam('lifetime', 'lifetime', parseFloat);

// Sidebar controls
const controls = [
  'grid', 'grav', 'drag', 'vort',
  'pulseAmp', 'pulseRad',
  'nCircles', 'nBoxes', 'nSlits', 'size',
];
controls.forEach(id => {
  const el = document.getElementById(id);
  const val = document.getElementById(id + 'Val');
  if (el && val) {
    el.addEventListener('input', () => {
      val.textContent = el.value;

    });
  }
});

// Generate obstacles
document.getElementById('gen').onclick = () => {
  // Always clear obstacles before generating new ones
  wave.clearObstacles();
  const size = wave.gridSize;
  // Circles
  for (let i = 0; i < simParams.nCircles; ++i) {
    const x = Math.round(size * (0.2 + 0.6 * Math.random()));
    const y = Math.round(size * (0.2 + 0.6 * Math.random()));
    wave.addObstacle('circle', { x, y, r: Math.round(simParams.size * 0.25) });
  }
  // Boxes
  for (let i = 0; i < simParams.nBoxes; ++i) {
    const x = Math.round(size * (0.2 + 0.6 * Math.random()));
    const y = Math.round(size * (0.2 + 0.6 * Math.random()));
    wave.addObstacle('box', { x, y, w: simParams.size, h: simParams.size });
  }
  // Slits
  for (let i = 0; i < simParams.nSlits; ++i) {
    const x = Math.round(size * (0.2 + 0.6 * Math.random()));
    const y = Math.round(size * (0.2 + 0.6 * Math.random()));
    wave.addObstacle('slit', { x, y, w: simParams.size * 2, h: simParams.size, slitWidth: Math.max(2, simParams.size / 2) });
  }

  
};
// Reset simulation
document.getElementById('resetBtn').onclick = () => {
  wave.reset();
};

document.getElementById('clear').onclick = () => {
  wave.clearObstacles();
};
document.getElementById('pauseBtn').onclick = () => {
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? 'Resume' : 'Pause';
};
document.getElementById('resetBtn').onclick = () => {
  wave.reset();
};

// Mouse interaction
let paused = false;
let isDragging = false;
let dragReleaseUntil = 0;
let lastDragPos = null;
let radialUntil = 0;
let radialPos = null;
canvas.onpointerdown = (e) => {
  if (e.button === 0) {
    isDragging = true;
    dragReleaseUntil = 0;
    lastDragPos = null;
  } else if (e.button === 2) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * wave.gridSize;
    const y = ((rect.height - (e.clientY - rect.top)) / rect.height) * wave.gridSize;
    radialUntil = performance.now() + simParams.lifetime * 1000;
    radialPos = { x, y };
  }
};
canvas.onpointermove = (e) => {
  if (isDragging) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * wave.gridSize;
    const y = ((rect.height - (e.clientY - rect.top)) / rect.height) * wave.gridSize;
    wave.impulse(x, y, simParams.pulseAmp, simParams.pulseRad, [0, 0]);
    lastDragPos = { x, y };
  }
};
canvas.onpointerup = (e) => {
  if (e.button === 0) {
    isDragging = false;
    dragReleaseUntil = performance.now() + simParams.lifetime * 1000;
  }
};
canvas.onpointerleave = () => {
  isDragging = false;
  dragReleaseUntil = 0;
};
canvas.oncontextmenu = e => {
  e.preventDefault();
  return false;
};
const lifetimeSlider = document.getElementById('lifetime');
const lifetimeVal = document.getElementById('lifetimeVal');
lifetimeSlider.addEventListener('input', () => {
  lifetimeVal.textContent = parseFloat(lifetimeSlider.value).toFixed(2) + 's';
});
lifetimeVal.textContent = parseFloat(lifetimeSlider.value).toFixed(2) + 's';
function animate() {
  if (!paused) wave.step({
    damping: simParams.damping,
    gravity: simParams.gravity,
    drag: simParams.drag,
    vorticity: simParams.vorticity
  });
  const now = performance.now();
  // After drag release, emit impulse for simParams.lifetime seconds
  if (dragReleaseUntil > 0 && lastDragPos) {
    if (now < dragReleaseUntil) {
      wave.impulse(lastDragPos.x, lastDragPos.y, simParams.pulseAmp, simParams.pulseRad, [0, 0]);
    } else {
      dragReleaseUntil = 0;
      lastDragPos = null;
    }
  }
  // Emit radial wave for simParams.lifetime seconds
  if (radialUntil > 0 && radialPos) {
    if (now < radialUntil) {
      wave.impulse(radialPos.x, radialPos.y, simParams.pulseAmp, simParams.pulseRad, [0, 0]);
    } else {
      // Explicitly zero the center after emission ends
      wave.impulse(radialPos.x, radialPos.y, 0, simParams.pulseRad, [0, 0]);
      radialUntil = 0;
      radialPos = null;
    }
  }
  wave.render();
  requestAnimationFrame(animate);
}
animate();
