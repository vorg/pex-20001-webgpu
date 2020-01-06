const createCube = require("primitive-cube");
const createTorus = require("primitive-torus");
const { mat4 } = require("pex-math");
const createContext = require("./context");
const loadImage = require("./load-image");
const {
  perspective: createCamera,
  orbiter: createOrbiter
} = require("pex-cam");

const computeShaderGLSL = `
#version 450
  struct Particle {
    vec2 pos;
    vec2 vel;
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
    Particle particles[1500];
  } particlesA;

  layout(std140, set = 0, binding = 2) buffer ParticlesB {
    Particle particles[1500];
  } particlesB;

  void main() {
    // https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp

    uint index = gl_GlobalInvocationID.x;
    if (index >= 1500) { return; }

    vec2 vPos = particlesA.particles[index].pos;
    vec2 vVel = particlesA.particles[index].vel;

    vec2 cMass = vec2(0.0, 0.0);
    vec2 cVel = vec2(0.0, 0.0);
    vec2 colVel = vec2(0.0, 0.0);
    int cMassCount = 0;
    int cVelCount = 0;

    vec2 pos;
    vec2 vel;
    for (int i = 0; i < 1500; ++i) {
      if (i == index) { continue; }
      pos = particlesA.particles[i].pos.xy;
      vel = particlesA.particles[i].vel.xy;

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
  `


const vertexShaderGLSL = `
#version 450
  layout(location = 0) in vec2 a_particlePos;
  layout(location = 1) in vec2 a_particleVel;
  layout(location = 2) in vec2 a_pos;
  void main() {
    float angle = -atan(a_particleVel.x, a_particleVel.y);
    vec2 pos = vec2(a_pos.x * cos(angle) - a_pos.y * sin(angle),
            a_pos.x * sin(angle) + a_pos.y * cos(angle));
    gl_Position = vec4(pos + a_particlePos, 0, 1);
  }`

const fragmentShaderGLSL = `
#version 450
  layout(location = 0) out vec4 fragColor;
  void main() {
    fragColor = vec4(1.0);
  }`

const numParticles = 1500;


async function init() {
  const ctx = await createContext({ width: 600, height: 600 });
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

  /* old */
  // const computeBindGroupLayout = device.createBindGroupLayout({
  //   bindings: [
  //     { binding: 0, visibility: GPUShaderStage.COMPUTE, type: "uniform-buffer" },
  //     { binding: 1, visibility: GPUShaderStage.COMPUTE, type: "storage-buffer" },
  //     { binding: 2, visibility: GPUShaderStage.COMPUTE, type: "storage-buffer" },
  //   ],
  // });
  const computeBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.UniformBuffer },
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.StorageBuffer },
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.StorageBuffer }
  ]);

  // const renderPipeline = device.createRenderPipeline({
  //   layout: device.createPipelineLayout({ bindGroupLayouts: [] }),

  //   vertexStage: {
  //     module: device.createShaderModule({
  //       code: glslang.compileGLSL(vertexShaderGLSL, "vertex"),

  //       // @ts-ignore
  //       source: vertexShaderGLSL,
  //       transform: source => glslang.compileGLSL(source, "vertex"),
  //     }),
  //     entryPoint: "main"
  //   },
  //   fragmentStage: {
  //     module: device.createShaderModule({
  //       code: glslang.compileGLSL(fragmentShaderGLSL, "fragment"),

  //       // @ts-ignore
  //       source: fragmentShaderGLSL,
  //       transform: source => glslang.compileGLSL(source, "fragment"),
  //     }),
  //     entryPoint: "main"
  //   },

  //   primitiveTopology: "triangle-list",

  //   depthStencilState: {
  //     depthWriteEnabled: true,
  //     depthCompare: "less",
  //     format: "depth24plus-stencil8",
  //   },

  //   vertexState: {
  //     vertexBuffers: [{
  //       // instanced particles buffer
  //       arrayStride: 4 * 4,
  //       stepMode: "instance",
  //       attributes: [{
  //         // instance position
  //         shaderLocation: 0,
  //         offset: 0,
  //         format: "float2"
  //       }, {
  //         // instance velocity
  //         shaderLocation: 1,
  //         offset: 2 * 4,
  //         format: "float2"
  //       }],
  //     }, {
  //       // vertex buffer
  //       arrayStride: 2 * 4,
  //       stepMode: "vertex",
  //       attributes: [{
  //         // vertex positions
  //         shaderLocation: 2,
  //         offset: 0,
  //         format: "float2"
  //       }],
  //     }],
  //   },

  //   colorStates: [{
  //     format: "bgra8unorm",
  //   }],
  // });

  const pipeline = ctx.pipeline({
    vert: vertexShaderGLSL,
    frag: fragmentShaderGLSL,
    bindGroupLayouts: []
  });

  // const computePipeline = device.createComputePipeline({
  //   layout: computePipelineLayout,
  //   computeStage: {
  //     module: device.createShaderModule({
  //       code: glslang.compileGLSL(computeShaderGLSL, "compute"),

  //       // @ts-ignore
  //       source: computeShaderGLSL,
  //       transform: source => glslang.compileGLSL(source, "compute"),
  //     }),
  //     entryPoint: "main"
  //   },
  // });

  const computePipeline = ctx.computePipeline({
    compute: computeShaderGLSL,
    bindGroupLayouts: [computeBindGroupLayout]
  });

  // const depthTexture = device.createTexture({
  //   size: { width: canvas.width, height: canvas.height, depth: 1 },
  //   format: "depth24plus-stencil8",
  //   usage: GPUTextureUsage.OUTPUT_ATTACHMENT
  // });
  const depthTexture = ctx.texture({
    width: ctx.canvas.width,
    height: ctx.canvas.height,
    format: ctx.PixelFormat.Depth24PlusStencil18
  });

  // const renderPassDescriptor = {
  //   colorAttachments: [{
  //     attachment: undefined,  // Assigned later
  //     loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
  //   }],
  //   depthStencilAttachment: {
  //     attachment: depthTexture.createView(),
  //     depthLoadValue: 1.0,
  //     depthStoreOp: "store",
  //     stencilLoadValue: 0,
  //     stencilStoreOp: "store",
  //   }
  // };

  const pass = ctx.pass({
    clearColor: [1, 0, 0, 1],
    depth: depthTexture,
    clearDepth: 1
  });

  
  // const vertexBufferData = new Float32Array([-0.01, -0.02, 0.01, -0.02, 0.00, 0.02]);
  // const verticesBuffer = device.createBuffer({
  //   size: vertexBufferData.byteLength,
  //   usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  // });
  // verticesBuffer.setSubData(0, vertexBufferData);

  let vertexBuffer = ctx.vertexBuffer({ data: [-0.01, -0.02, 0.01, -0.02, 0.00, 0.02] });

  const simParamData = new Float32Array([
    0.04,  // deltaT;
    0.1,   // rule1Distance;
    0.025, // rule2Distance;
    0.025, // rule3Distance;
    0.02,  // rule1Scale;
    0.05,  // rule2Scale;
    0.005  // rule3Scale;
  ]);
  // const simParamBuffer = device.createBuffer({
  //   size: simParamData.byteLength,
  //   usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  // });
  // simParamBuffer.setSubData(0, simParamData);

  const simParamBuffer = ctx.uniformBuffer({
    size: simParamData.byteLength
  });
  ctx.update(simParamBuffer, { offset: 0, data: simParamData })

  const initialParticleData = new Float32Array(numParticles * 4);
  for (let i = 0; i < numParticles; ++i) {
    initialParticleData[4 * i + 0] = 2 * (Math.random() - 0.5);
    initialParticleData[4 * i + 1] = 2 * (Math.random() - 0.5);
    initialParticleData[4 * i + 2] = 2 * (Math.random() - 0.5) * 0.1;
    initialParticleData[4 * i + 3] = 2 * (Math.random() - 0.5) * 0.1;
  }

  const particleBuffers = new Array(2);
  const particleBindGroups = new Array(2);
  for (let i = 0; i < 2; ++i) {
    // particleBuffers[i] = device.createBuffer({
    //   size: initialParticleData.byteLength,
    //   usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE
    // });    
    //particleBuffers[i].setSubData(0, initialParticleData);
    particleBuffers[i] = ctx.vertexBuffer({ data: initialParticleData });
  }

  for (let i = 0; i < 2; ++i) {
    particleBindGroups[i] = device.createBindGroup({
      layout: computeBindGroupLayout,
      bindings: [{
        binding: 0,
        resource: {
          buffer: simParamBuffer,
          offset: 0,
          size: simParamData.byteLength
        },
      }, {
        binding: 1,
        resource: {
          buffer: particleBuffers[i],
          offset: 0,
          size: initialParticleData.byteLength,
        },
      }, {
        binding: 2,
        resource: {
          buffer: particleBuffers[(i + 1) % 2],
          offset: 0,
          size: initialParticleData.byteLength,
        },
      }],
    });
  }

  // let t = 0;
  // return function frame() {
  //   renderPassDescriptor.colorAttachments[0].attachment = swapChain.getCurrentTexture().createView();

  //   const commandEncoder = device.createCommandEncoder({});
  //   {
  //     const passEncoder = commandEncoder.beginComputePass();
  //     passEncoder.setPipeline(computePipeline);
  //     passEncoder.setBindGroup(0, particleBindGroups[t % 2]);
  //     passEncoder.dispatch(numParticles);
  //     passEncoder.endPass();
  //   }
  //   {
  //     const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  //     passEncoder.setPipeline(renderPipeline);
  //     passEncoder.setVertexBuffer(0, particleBuffers[(t + 1) % 2]);
  //     passEncoder.setVertexBuffer(1, verticesBuffer);
  //     passEncoder.draw(3, numParticles, 0, 0);
  //     passEncoder.endPass();
  //   }
  //   device.defaultQueue.submit([commandEncoder.finish()]);

  //   ++t;
  // }

  const renderPassCmd = {
    pass: pass,
    pipeline: pipeline
  };


  let t = 0;
  function render() {
    ctx.submit(renderPassCmd, () => {
    })

    ++t;
  }

  /*old*/


  ctx.frame(render);
}

init();