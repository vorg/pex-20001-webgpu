const createCube = require("primitive-cube");
const createTorus = require("primitive-torus");
const { mat4 } = require("pex-math");
const createContext = require("./context");
const loadImage = require("./load-image");
const random = require('pex-random')
const {
  perspective: createCamera,
  orbiter: createOrbiter
} = require("pex-cam");

const numParticles = 12 * 1024;

const computeShaderGLSL = `
#version 450
  struct Particle {
    vec2 pos;
    vec2 vel;
    vec4 color;
  };

  layout(std140, set = 0, binding = 0) uniform SimParams {
    float deltaT;
    float rule1Distance;
    float rule2Distance;
    float rule3Distance;
    float rule1Scale;
    float rule2Scale;
    float rule3Scale;
  } params;

  layout(std140, set = 0, binding = 1) buffer ParticlesA {
    Particle particles[${numParticles}];
  } particlesA;

  layout(std140, set = 0, binding = 2) buffer ParticlesB {
    Particle particles[${numParticles}];
  } particlesB;

  // magic
  layout(local_size_x = 128, local_size_y = 1, local_size_z = 1) in;

  void main() {
    // https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp

    uint index = gl_GlobalInvocationID.x;
    if (index >= ${numParticles}) { return; }

    vec2 vPos = particlesA.particles[index].pos;
    vec2 vVel = particlesA.particles[index].vel;

    vec2 cMass = vec2(0.0, 0.0);
    vec2 cVel = vec2(0.0, 0.0);
    vec2 colVel = vec2(0.0, 0.0);
    int cMassCount = 0;
    int cVelCount = 0;

    vec2 pos;
    vec2 vel;
    for (int i = 0; i < ${numParticles}; ++i) {
      if (i == index) { continue; }      
      pos = particlesA.particles[i].pos.xy;
      vel = particlesA.particles[i].vel.xy;

      vec2 tmp = pos - vPos;
      float distSq = dot(tmp, tmp);
      if (distSq > 0.1 * 0.1) continue;

      if (distance(pos, vPos) < params.rule1Distance) {
        cMass += pos;
        cMassCount++;
      }
      if (distance(pos, vPos) < params.rule2Distance) {
        colVel -= (pos - vPos);
      }
      if (distance(pos, vPos) < params.rule3Distance) {
        cVel += vel;
        cVelCount++;
      }
    }
    if (cMassCount > 0) {
      cMass = cMass / cMassCount - vPos;
    }
    if (cVelCount > 0) {
      cVel = cVel / cVelCount;
    }

    vVel += cMass * params.rule1Scale + colVel * params.rule2Scale + cVel * params.rule3Scale;

    // clamp velocity for a more pleasing simulation.
    vVel = normalize(vVel) * clamp(length(vVel), 0.0, 0.1);

    // kinematic update
    vPos += vVel * params.deltaT;

    // Wrap around boundary
    if (vPos.x < -1.0) vPos.x = 1.0;
    if (vPos.x > 1.0) vPos.x = -1.0;
    if (vPos.y < -1.0) vPos.y = 1.0;
    if (vPos.y > 1.0) vPos.y = -1.0;

    particlesB.particles[index].pos = vPos;

    // Write back
    particlesB.particles[index].vel = vVel;
  }
  `;

const vertexShaderGLSL = `
#version 450
  layout(location = 0) in vec2 a_particlePos;
  layout(location = 1) in vec2 a_particleVel;  
  layout(location = 2) in vec2 a_pos;
  layout(location = 3) in vec4 a_particleColor;
  layout(location = 0) out vec4 vColor;
  void main() {
    float angle = -atan(a_particleVel.x, a_particleVel.y);
    vec2 pos = vec2(a_pos.x * cos(angle) - a_pos.y * sin(angle),
            a_pos.x * sin(angle) + a_pos.y * cos(angle));
    gl_Position = vec4(pos + a_particlePos, 0, 1);
    vColor = a_particleColor;
  }`;

const fragmentShaderGLSL = `
#version 450
  layout(location = 0) in vec4 vColor;
  layout(location = 0) out vec4 fragColor;
  void main() {
    fragColor = vec4(1.0);
    fragColor = vColor;
  }`;

async function init() {
  const ctx = await createContext({ width: 600, height: 600 });
  document.body.style.margin = 0

  console.log("webgpu ctx", ctx);

  const camera = createCamera({
    fov: Math.PI / 3,
    aspect: ctx.canvas.width / ctx.canvas.height,
    near: 0.1,
    far: 100,
    position: [2, 0, 2]
  });

  const orbiter = createOrbiter({
    camera: camera,
    element: ctx.canvas
  });

  const computeBindGroupLayout = ctx.bindGroupLayout([
    {
      visibility: ctx.ShaderStage.Compute,
      type: ctx.BindingType.UniformBuffer
    },
    {
      visibility: ctx.ShaderStage.Compute,
      type: ctx.BindingType.StorageBuffer
    },
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.StorageBuffer }
  ]);

  const pipeline = ctx.pipeline({
    vert: vertexShaderGLSL,
    frag: fragmentShaderGLSL,    
    bindGroupLayouts: [],
    //TODO: vertex format simplification
    vertexState: {
      vertexBuffers: [
        {
          // instanced particles buffer
          arrayStride: 8 * 4,
          stepMode: "instance",
          attributes: [
            {
              // instance position
              shaderLocation: 0,
              offset: 0,
              format: "float2"
            },
            {
              // instance velocity
              shaderLocation: 1,
              offset: 2 * 4,
              format: "float2"
            },
            {
              // instance color
              shaderLocation: 3,
              offset: 4 * 4,
              format: "float2"
            }
          ]
        },
        {
          // vertex buffer
          arrayStride: 2 * 4,
          stepMode: "vertex",
          attributes: [
            {
              // vertex positions
              shaderLocation: 2,
              offset: 0,
              format: "float2"
            }
          ]
        }
      ]
    }
  });

  const computePipeline = ctx.computePipeline({
    compute: computeShaderGLSL,
    bindGroupLayouts: [computeBindGroupLayout]
  });

  const depthTexture = ctx.texture({
    width: ctx.canvas.width,
    height: ctx.canvas.height,
    format: ctx.PixelFormat.Depth24PlusStencil18
  });

  const pass = ctx.pass({
    clearColor: [0, 0, 0, 1],
    depth: depthTexture,
    clearDepth: 1
  });

  let verticesBuffer = ctx.vertexBuffer({
    data: [-0.01, -0.02, 0.01, -0.02, 0.0, 0.02].map((f) => f * 0.5)
  });

  const s = 0.75
  const simParamData = new Float32Array([
    0.04, // deltaT;
    s * 0.1, // rule1Distance;
    s * 0.025, // rule2Distance;
    s * 0.025, // rule3Distance;
    0.02, // rule1Scale;
    0.05, // rule2Scale;
    0.005 // rule3Scale;
  ]);

  const simParamBuffer = ctx.uniformBuffer({
    size: simParamData.byteLength
  });
  ctx.update(simParamBuffer, { offset: 0, data: simParamData });

  const initialParticleData = new Float32Array(numParticles * 8);
  for (let i = 0; i < numParticles; ++i) {
    var u = Math.random()
    var v = Math.random()
    initialParticleData[8 * i + 0] = 2 * (u - 0.5);
    initialParticleData[8 * i + 1] = 2 * (v - 0.5);
    initialParticleData[8 * i + 2] = random.float(0.1, 0.3);
    initialParticleData[8 * i + 3] = random.float(0.1, 0.3);
    initialParticleData[8 * i + 4] = u
    initialParticleData[8 * i + 5] = v
    initialParticleData[8 * i + 6] = 0
    initialParticleData[8 * i + 7] = 1
  }

  const particleBuffers = new Array(2);
  const particleBindGroups = new Array(2);
  for (let i = 0; i < 2; ++i) {
    particleBuffers[i] = ctx.vertexBuffer({
      data: initialParticleData,
      usage:
        GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE
    });
  }

  for (let i = 0; i < 2; ++i) {
    particleBindGroups[i] = ctx.bindGroup({
      layout: computeBindGroupLayout,
      bindings: [
        {
          buffer: simParamBuffer,
          offset: 0,
          size: simParamData.byteLength
        },
        {
          buffer: particleBuffers[i],
          offset: 0,
          size: initialParticleData.byteLength
        },
        {
          buffer: particleBuffers[(i + 1) % 2],
          offset: 0,
          size: initialParticleData.byteLength
        }
      ]
    });
  }

  const drawCmd = {
    pass: pass,
    pipeline: pipeline,
    attributes: [null, verticesBuffer],
    uniforms: [],
    count: 3,
    instances: numParticles
  };

  let t = 0;
  function render() {
    const commandEncoder = ctx.defaultCommandEncoder
    {
      const passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(computePipeline);
      passEncoder.setBindGroup(0, particleBindGroups[t % 2]);
      passEncoder.dispatch(numParticles);
      passEncoder.endPass();
    }

    drawCmd.attributes[0] = particleBuffers[(t + 1) % 2];
    ctx.submit(drawCmd);

    ++t;
  }

  /*old*/

  ctx.frame(render);
}

init();
