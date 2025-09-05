const EXTENSIONS = [
  'EXT_color_buffer_float',
  'OES_texture_float_linear',
  'OES_texture_half_float',
  'OES_texture_half_float_linear',
];

function WaveGL(canvas, opts = {}) {
  this.canvas = canvas;
  this.gl = canvas.getContext('webgl2');
  if (!this.gl) throw new Error('WebGL2 not supported');
  this._initExtensions();
  this._initState(opts);
  this._initShaders();
  this._resize();
  window.addEventListener('resize', () => this._resize());
}

WaveGL.prototype._initExtensions = function() {
  EXTENSIONS.forEach(ext => {
    if (this.gl.getExtension(ext)) {
      console.log('Enabled extension:', ext);
    }
  });
};

WaveGL.prototype._initState = function(opts) {
  this.gridSize = opts.gridSize || 256;
  const gl = this.gl;
  this.heightField = new Float32Array(this.gridSize * this.gridSize);
  this.prevField = new Float32Array(this.gridSize * this.gridSize);
  this.obstacleField = new Uint8Array(this.gridSize * this.gridSize);
  this.heightTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32F,
    this.gridSize,
    this.gridSize,
    0,
    gl.RED,
    gl.FLOAT,
    this.heightField
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Re-create obstacle texture to match grid size
  this._obstacleTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, this._obstacleTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    this.gridSize,
    this.gridSize,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    this.obstacleField
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
};

WaveGL.prototype._initShaders = function() {
  const gl = this.gl;
  // Vertex shader: passthrough
  const vertSrc = `#version 300 es\n
    in vec2 aPos;
    out vec2 vUV;
    void main() {
      vUV = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0, 1);
    }
  `;
  // Fragment shader
  const fragSrc = `#version 300 es\n
    precision highp float;
    in vec2 vUV;
    out vec4 outColor;
    uniform sampler2D uHeight;
    uniform float uGridSize;
    uniform sampler2D uObstacle;
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    void main() {
      float h = texture(uHeight, vUV).r;
      float px = 1.0 / uGridSize;
      float hL = texture(uHeight, vUV + vec2(-px, 0)).r;
      float hR = texture(uHeight, vUV + vec2(px, 0)).r;
      float hU = texture(uHeight, vUV + vec2(0, -px)).r;
      float hD = texture(uHeight, vUV + vec2(0, px)).r;
      float dx = (hR - hL) * 0.5;
      float dy = (hD - hU) * 0.5;
      float angle = atan(dy, dx);
      float mag = sqrt(dx*dx + dy*dy);
      float hue = mod((angle + 3.14159) / (2.0 * 3.14159) + 0.6, 1.0);
      float sat = 0.35 + 0.25 * clamp(mag * 8.0, 0.0, 1.0);
      float val = 0.18 + 0.45 * clamp(abs(h) * 1.5, 0.0, 1.0);
      vec3 rgb = hsv2rgb(vec3(hue, sat, val));
      float alpha = smoothstep(0.01, 0.03, abs(h));
      float obs = texture(uObstacle, vUV).r;
      if (obs > 0.1) {
        float obsL = texture(uObstacle, vUV + vec2(-px, 0)).r;
        float obsR = texture(uObstacle, vUV + vec2(px, 0)).r;
        float obsU = texture(uObstacle, vUV + vec2(0, -px)).r;
        float obsD = texture(uObstacle, vUV + vec2(0, px)).r;
        float outline = (obsL < 0.1 || obsR < 0.1 || obsU < 0.1 || obsD < 0.1) ? 1.0 : 0.0;
        vec3 fillColor = vec3(0.48, 0.85, 0.85); // pastel teal
        vec3 outlineColor = vec3(0.68, 0.94, 1.0); // pastel blue
        float outlineMix = smoothstep(0.0, 1.0, outline * 0.7);
        outColor = vec4(mix(fillColor, outlineColor, outlineMix), 1.0);
      } else {
        outColor = vec4(mix(vec3(0.0), rgb, alpha), 1.0);
      }
    }
  `;
  this._renderProgram = this._createProgram(vertSrc, fragSrc);
  // Obstacle texture
  this._obstacleTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, this._obstacleTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    this.gridSize,
    this.gridSize,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    this.obstacleField
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  this._quadVao = gl.createVertexArray();
  gl.bindVertexArray(this._quadVao);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1, 1, 1
  ]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(this._renderProgram, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
};

WaveGL.prototype._createProgram = function(vertSrc, fragSrc) {
  const gl = this.gl;
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      console.error('Source:', src);
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }
  const vert = compile(gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    throw new Error(gl.getProgramInfoLog(prog));
  }
  return prog;
};

WaveGL.prototype._resize = function() {
  // Ensure canvas size matches display size
  const dpr = window.devicePixelRatio || 1;
  this.canvas.width = Math.round(window.innerWidth * dpr);
  this.canvas.height = Math.round(window.innerHeight * dpr);
  this.canvas.style.width = window.innerWidth + 'px';
  this.canvas.style.height = window.innerHeight + 'px';
};

WaveGL.prototype.step = function(params) {
  const size = this.gridSize;
  const h = this.heightField;
  const hPrev = this.prevField;
  const obs = this.obstacleField;
  const hNext = new Float32Array(size * size);
  // Get parameters from UI
  const gravity = params && params.gravity !== undefined ? params.gravity : 1.0;
  const drag = params && params.drag !== undefined ? params.drag : 0.0;
  const vorticity = params && params.vorticity !== undefined ? params.vorticity : 0.0;
  const damping = params && params.damping ? params.damping : 0.995;
  const c = Math.sqrt(gravity) * 0.2; // wave speed scales with sqrt(gravity)
  for (let j = 1; j < size - 1; ++j) {
    for (let i = 1; i < size - 1; ++i) {
      const idx = j * size + i;
      if (obs[idx]) {
        hNext[idx] = 0; // obstacle: fixed boundary
      } else {
        // Laplacian
        const lap = h[idx-size] + h[idx+size] + h[idx-1] + h[idx+1] - 4*h[idx];
        // Simple vorticity: add curl of height field
        let vort = 0;
        if (vorticity > 0) {
          const dx = h[idx+1] - h[idx-1];
          const dy = h[idx+size] - h[idx-size];
          vort = vorticity * (dx - dy) * 0.25;
        }
        // Linear drag: subtract a fraction of previous height
        const dragTerm = drag * hPrev[idx];
        hNext[idx] = (2*h[idx] - hPrev[idx] + c*c*lap + vort - dragTerm) * damping;
      }
    }
  }
  // Swap buffers
  for (let k = 0; k < size*size; ++k) hPrev[k] = h[k];
  for (let k = 0; k < size*size; ++k) h[k] = hNext[k];
  // Upload to texture
  const gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RED, gl.FLOAT, h);
};

WaveGL.prototype.render = function() {
  const gl = this.gl;
  gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(this._renderProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
  gl.uniform1i(gl.getUniformLocation(this._renderProgram, 'uHeight'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, this._obstacleTex);
  gl.uniform1i(gl.getUniformLocation(this._renderProgram, 'uObstacle'), 1);
  gl.uniform1f(gl.getUniformLocation(this._renderProgram, 'uGridSize'), this.gridSize);
  // Update obstacle texture
  gl.bindTexture(gl.TEXTURE_2D, this._obstacleTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridSize, this.gridSize, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.obstacleField);
  gl.bindVertexArray(this._quadVao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
};

WaveGL.prototype.impulse = function(x, y, amp, rad, dir) {
  // Write a circular impulse into the JS-side height field, correcting for aspect ratio
  const size = this.gridSize;
  const arr = this.heightField;
  const aspect = this.canvas.width / this.canvas.height;
  for (let j = 0; j < size; ++j) {
    for (let i = 0; i < size; ++i) {
      // Map grid coordinates to normalized canvas coordinates
      const dx = (i - x) / size;
      const dy = (j - y) / size;
      // Scale dx by aspect ratio to ensure circular impulse
      const dist = Math.sqrt((dx * aspect) * (dx * aspect) + dy * dy) * size;
      if (dist < rad) {
        arr[j*size + i] += amp * Math.exp(-dist*dist/(rad*rad));
      }
    }
  }
  // Upload updated array to texture
  const gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RED, gl.FLOAT, arr);
};

WaveGL.prototype.addObstacle = function(type, params) {
  const size = this.gridSize;
  const field = this.obstacleField;
  if (type === 'circle') {
    const { x, y, r } = params;
    for (let j = 0; j < size; ++j) {
      for (let i = 0; i < size; ++i) {
        const dx = i - x;
        const dy = j - y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < r*r) field[j*size + i] = 255;
      }
    }
  } else if (type === 'box') {
    const { x, y, w, h } = params;
    for (let j = Math.max(0, y-h/2); j < Math.min(size, y+h/2); ++j) {
      for (let i = Math.max(0, x-w/2); i < Math.min(size, x+w/2); ++i) {
        field[Math.floor(j)*size + Math.floor(i)] = 255;
      }
    }
  } else if (type === 'slit') {
    const { x, y, w, h, slitWidth } = params;
    for (let j = Math.max(0, y-h/2); j < Math.min(size, y+h/2); ++j) {
      for (let i = Math.max(0, x-w/2); i < Math.min(size, x+w/2); ++i) {
        if (Math.abs(i-x) > slitWidth/2) field[Math.floor(j)*size + Math.floor(i)] = 255;
      }
    }
  }
};

WaveGL.prototype.clearObstacles = function() {
  this.obstacleField.fill(0);
};

WaveGL.prototype.reset = function() {
  // Clear height fields
  this.heightField.fill(0);
  this.prevField.fill(0);
  // Upload cleared field to texture
  const gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridSize, this.gridSize, gl.RED, gl.FLOAT, this.heightField);
};

window.WaveGL = WaveGL;
