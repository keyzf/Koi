/**
 * A wave simulation shader
 * @param {WebGLRenderingContext} gl A WebGL rendering context
 * @constructor
 */
const Waves = function(gl) {
    this.gl = gl;
    this.bufferQuad = gl.createBuffer();
    this.bufferFlare = this.createBufferFlare();
    this.programDistort = new Shader(
        gl,
        this.SHADER_DISTORT_VERTEX,
        this.SHADER_DISTORT_FRAGMENT,
        ["background", "waterBack", "waterFront", "size", "time"],
        ["position"]);
    this.programPropagate = new Shader(
        gl,
        this.SHADER_PROPAGATE_VERTEX,
        this.SHADER_PROPAGATE_FRAGMENT,
        ["size"],
        ["position"]);
    this.programInfluence = new Shader(
        gl,
        this.SHADER_INFLUENCE_VERTEX,
        this.SHADER_INFLUENCE_FRAGMENT,
        ["size", "origin", "radius"],
        ["vertex"]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.bufferQuad);
    this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
        gl.STATIC_DRAW);
};

Waves.prototype.SHADER_DISTORT_VERTEX = `#version 100
attribute vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

Waves.prototype.SHADER_DISTORT_FRAGMENT = `#version 100
uniform sampler2D background;
uniform sampler2D waterBack;
uniform sampler2D waterFront;
uniform mediump vec2 size;
uniform mediump float time;

mediump float get(int x, int y) {
  mediump vec2 uv = (gl_FragCoord.xy + vec2(float(x), float(y))) / size;
  
  return mix(texture2D(waterBack, uv).r, texture2D(waterFront, uv).r, time);
}

void main() {
  mediump float dx = get(1, 0) - get(-1, 0);
  mediump float dy = get(0, 1) - get(0, -1);
  mediump vec2 displacement = 40.0 * vec2(dx, dy) / size;
  mediump vec2 focus = vec2(-0.1, 0.1);
  mediump float shiny = max(0.0, -displacement.x - displacement.y) * 90.0;
  
  gl_FragColor = texture2D(background, gl_FragCoord.xy / size + displacement) * (1.0 + shiny);
}
`;

Waves.prototype.SHADER_PROPAGATE_VERTEX = `#version 100
attribute vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

Waves.prototype.SHADER_PROPAGATE_FRAGMENT = `#version 100
uniform sampler2D source;
uniform mediump vec2 size;

void main() {
  mediump float damping = 0.998;
  mediump vec4 pixel = texture2D(source, gl_FragCoord.xy / size);
  mediump vec4 pixelLeft = texture2D(source, vec2(gl_FragCoord.x - 1.0, gl_FragCoord.y) / size);
  mediump vec4 pixelRight = texture2D(source, vec2(gl_FragCoord.x + 1.0, gl_FragCoord.y) / size);
  mediump vec4 pixelUp = texture2D(source, vec2(gl_FragCoord.x, gl_FragCoord.y - 1.0) / size);
  mediump vec4 pixelDown = texture2D(source, vec2(gl_FragCoord.x, gl_FragCoord.y + 1.0) / size);
  
  gl_FragColor = vec4(((pixelLeft.r + pixelUp.r + pixelRight.r + pixelDown.r) / 2.0 - pixel.g) * damping, pixel.r, 0.0, 1.0);
}
`;

Waves.prototype.SHADER_INFLUENCE_VERTEX = `#version 100
uniform vec2 size;
uniform vec2 origin;
uniform float radius;

attribute vec3 vertex;

varying mediump float intensity;

void main() {
  intensity = vertex.z;
  
  gl_Position = vec4(vec2(2.0, -2.0) * (vertex.xy * radius + origin) / size + vec2(-1.0, 1.0), 0.0, 1.0);
}
`;

Waves.prototype.SHADER_INFLUENCE_FRAGMENT = `#version 100
varying mediump float intensity;

void main() {
  gl_FragColor = vec4(intensity, 0.0, 0.0, intensity);
}
`;

Waves.prototype.SHAPE_FLARE_PRECISION = 16;

/**
 * Create a buffer containing a flare shape
 */
Waves.prototype.createBufferFlare = function() {
    const buffer = this.gl.createBuffer();
    const vertices = [0, 0, 1];

    for (let i = 0; i <= this.SHAPE_FLARE_PRECISION; ++i) {
        const r = Math.PI * 2 * i / this.SHAPE_FLARE_PRECISION;

        vertices.push(
            Math.cos(r),
            Math.sin(r),
            0);
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    return buffer;
};

/**
 * Set up the quad bufferQuad for rendering
 */
Waves.prototype.useBuffer = function() {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.bufferQuad);
    this.gl.enableVertexAttribArray(this.programDistort.aPosition);
    this.gl.vertexAttribPointer(this.programDistort.aPosition, 2, this.gl.FLOAT, false, 8, 0);
};

/**
 * Apply all influences to the water buffer
 * @param {WaterPlane} water A water plane
 */
Waves.prototype.applyInfluences = function(water) {
    this.gl.enable(this.gl.BLEND); // TODO: Only when required
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.programInfluence.use();

    this.gl.uniform2f(this.programInfluence.uSize, water.width, water.height);

    if (water.flares.length !== 0) { // TODO: Put different shapes in different functions, array as argument
        const flareCount = water.flares.length / 3;

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.bufferFlare);
        this.gl.enableVertexAttribArray(this.programInfluence.aVertex);
        this.gl.vertexAttribPointer(
            this.programInfluence.aVertex,
            3,
            this.gl.FLOAT,
            false,
            12,
            0);

        for (let flare = 0; flare < flareCount; ++flare) {
            const index = flare + flare + flare;

            this.gl.uniform2f(this.programInfluence.uOrigin,
                water.flares[index] * WaterPlane.prototype.RESOLUTION,
                water.flares[index + 1] * WaterPlane.prototype.RESOLUTION);
            this.gl.uniform1f(this.programInfluence.uRadius,
                water.flares[index + 2] * WaterPlane.prototype.RESOLUTION);

            this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, this.SHAPE_FLARE_PRECISION + 2);
        }

        water.flares.length = 0;
    }

    this.gl.disable(this.gl.BLEND);
};

/**
 * Propagate the waves on a water plane
 * @param {WaterPlane} water A water plane
 */
Waves.prototype.propagate = function(water) {
    this.programPropagate.use();

    water.flip();
    water.getFront().target();

    this.gl.uniform2f(this.programPropagate.uSize, water.width, water.height);

    this.useBuffer();

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, water.getBack().texture);

    this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);

    this.applyInfluences(water);
};

/**
 * Render waves
 * @param {WebGLTexture} background A background texture
 * @param {WaterPlane} water A water plane to shade the background with
 * @param {Number} width The background width in pixels
 * @param {Number} height The background height in pixels
 * @param {Number} time The interpolation factor
 */
Waves.prototype.render = function(background, water, width, height, time) {
    this.programDistort.use();

    this.gl.uniform1i(this.programDistort.uBackground, 0);
    this.gl.uniform1i(this.programDistort.uWaterBack, 1);
    this.gl.uniform1i(this.programDistort.uWaterFront, 2);
    this.gl.uniform2f(this.programDistort.uSize, width, height);
    this.gl.uniform1f(this.programDistort.uTime, time);

    this.useBuffer();

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, background);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, water.getBack().texture);
    this.gl.activeTexture(this.gl.TEXTURE2);
    this.gl.bindTexture(this.gl.TEXTURE_2D, water.getFront().texture);

    this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
};

/**
 * Free all resources maintained by this object
 */
Waves.prototype.free = function() {
    this.gl.deleteBuffer(this.bufferQuad);
    this.gl.deleteBuffer(this.bufferFlare);
    this.programDistort.free();
    this.programPropagate.free();
    this.programInfluence.free();
};