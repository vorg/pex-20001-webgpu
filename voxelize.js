const createCube = require("primitive-cube");
const { mat4, utils } = require("pex-math");
const createContext = require("./context");
const voxelize = require("voxelize");
const { vec3 } = require('pex-math')
const loadImage = require("./load-image");

const {
  perspective: createCamera,
  orbiter: createOrbiter
} = require("pex-cam");
const bunny = require("bunny");
const centerAndNormalize = require("geom-center-and-normalize");
const normalizedPositions = centerAndNormalize(bunny.positions);
const geometry = {
  ...bunny,
  uvs: normalizedPositions.map(p => [p[0] * 2 + 1, p[1] * 2 + 1]),
  positions: normalizedPositions
};

const gridSize = 1;
const gridResolution = 100;
const step = gridSize / gridResolution;
const numVoxels = gridResolution * gridResolution * gridResolution;
let voxels = new Float32Array(numVoxels);
let voxelColors = new Array(numVoxels * 4).fill(0).map(() => Math.random());
const N = gridResolution;

const {
  vertexShaderGLSL,
  fragmentShaderGLSL,
  vertexShaderMeshGLSL,
  fragmentShaderMeshGLSL,
  computeShaderGLSL,
  voxelizeSurfaceFrontComputeGLSL,
  voxelizeSurfaceBlurComputeGLSL
} = require("./voxelize-shaders");

console.time("voxelize on cpu");
const voxelData = voxelize(geometry.cells, geometry.positions, step);
// const voxelData = voxelize(mesh.cells, mesh.positions, gridSize, gridResolution)
console.log("voxelData", voxelData);

for (var i = 0; i < voxelData.voxels.shape[0]; i++) {
  for (var j = 0; j < voxelData.voxels.shape[1]; j++) {
    for (var k = 0; k < voxelData.voxels.shape[2]; k++) {
      var ix = i + Math.floor((N - voxelData.voxels.shape[0]) / 2);
      var iy = j + Math.floor((N - voxelData.voxels.shape[1]) / 2);
      var iz = k + Math.floor((N - voxelData.voxels.shape[2]) / 2);
      var val = voxelData.voxels.get(i, j, k);
      var index = ix + iz * N + iy * N * N;
      voxels[index] = val;
    }
  }
}
console.timeEnd("voxelize on cpu");

function indexToXYZ(i) {
  let x = i % N;
  let y = Math.floor(i / (N * N));
  let z = Math.floor(i / (N)) % N;
  return [x, y, z]
}

function xyzToIndex([x, y, z]) {
  return x + z * N + y * N * N
}

var idx = N * N + 1234

for (let i = 0; i < numVoxels; i++) {
  let x = i % N;
  let y = Math.floor(i / (N * N));
  let z = Math.floor(i / (N)) % N;
//   x /= 15
//   y /= 15
//   z /= 15
//   var value = 0
//   if (x == 0) value = 1
//   voxels[i] = value
//   //voxels[i] = (random.noise3(x, y, z) > 0) ? 1 : 0

  let count = 0
  for (z; z < N; z++) {
    const index = x + z * N + y * N * N
    if (voxels[index] > 0) {
      count++
    } else {
      break
    }
  }
    // int count = 0;    
    // for (int z = resultCell.z; z < N; z++) {
    //   int index = resultCell.x + z * N + resultCell.y * N * N;
    //   if (voxelData.voxels[index] > 0.0) {
    //     count++;
    //   } else {        
    //     break;
    //   }
    // }
    
    // voxelColorData.colors[index] = vec4(, 0.0, 0.0, 1.0);
    voxelColors[i * 4 + 0] = count ? Math.max(0.0, 1.0 - count / 100.0) : 0;
    voxelColors[i * 4 + 1] = 0.0;
    voxelColors[i * 4 + 2] = 0.0;
    voxelColors[i * 4 + 3] = 1.0;
}

var newVoxelColors = new Float32Array(voxelColors.length)

var calculateOnCpu = false
if (calculateOnCpu) {
for (let i = 0; i < numVoxels; i++) {
  let x = i % N;
  let y = Math.floor(i / (N * N));
  let z = Math.floor(i / (N)) % N;
  var r = 5
  // var color = [0, 0, 0, 0]
  var color = [200 * voxelColors[i * 4 + 0], 200 * voxelColors[i * 4 + 1], 200 * voxelColors[i * 4 + 2], 200 * voxelColors[i * 4 + 3]]
  var count = 0
  var ix = x
  var iy = y
  var iz = z
  var scale = 1
  
  for (var ix = Math.max(0, x - r); ix < Math.min(N, x + r + 1); ix++) {
    for (var iy = Math.max(0, y - r); iy < Math.min(N, y + r + 1); iy++) {
      for (var iz = Math.max(0, z - r); iz < Math.min(N, z + r + 1); iz++) {
        const index = ix + iz * N + iy * N * N
        color[0] += voxelColors[index * 4 + 0] * scale
        color[1] += voxelColors[index * 4 + 1] * scale
        color[2] += voxelColors[index * 4 + 2] * scale
        color[3] += voxelColors[index * 4 + 3] * scale
        count++            
      }
    }
  }

  newVoxelColors[i * 4 + 0] = Math.max(voxelColors[index * 4 + 0], count ? (color[0] / count * 1.0) : 0)
  newVoxelColors[i * 4 + 1] = Math.max(voxelColors[index * 4 + 1], count ? (color[1] / count * 1.0) : 0)
  newVoxelColors[i * 4 + 2] = Math.max(voxelColors[index * 4 + 2], count ? (color[2] / count * 1.0) : 0)
  newVoxelColors[i * 4 + 3] = Math.max(voxelColors[index * 4 + 3], count ? (color[3] / count * 1.0) : 0)
}
}

// TODO
// voxelColors = newVoxelColors

console.log("voxels", voxels);

async function init() {
  const ctx = await createContext({ width: 600, height: 600 });
  console.log("webgpu ctx", ctx);

  const camera = createCamera({
    fov: Math.PI / 3,
    aspect: ctx.canvas.width / ctx.canvas.height,
    near: 0.1,
    far: 100,
    position: [0, 0.5, 2]
  });

  const orbiter = createOrbiter({
    camera: camera,
    element: ctx.canvas
  });

  let cube = createCube((gridSize / gridResolution) * 0.9);

  const mat4Size = 16 * Float32Array.BYTES_PER_ELEMENT;
  const vec2Size = 2 * Float32Array.BYTES_PER_ELEMENT;

  // SHARED

  const uniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer }
  ]);

  const optsUniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer }
  ]);

  const optsVoxelUniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer },
    { visibility: ctx.ShaderStage.Fragment, type: ctx.BindingType.Sampler },
    { visibility: ctx.ShaderStage.Fragment, type: ctx.BindingType.SampledTexture }
  ]);

    

  const shared = {
    uniformBuffer: ctx.uniformBuffer({ size: mat4Size * 2 }),
    uniformBindGroup: null
  };

  shared.uniformBindGroup = ctx.bindGroup({
    layout: uniformsBindGroupLayout,
    bindings: [{ buffer: shared.uniformBuffer }]
  });

  // MESH

  const triangleMesh = {
    optsUniformBuffer: ctx.uniformBuffer({ size: mat4Size + vec2Size }),
    uniformBindGroup: null,
    pipeline: null,
    drawCmd: null,
    modelMatrix: new Float32Array(16),
    vertexBuffer: ctx.vertexBuffer({ data: geometry.positions }),
    uvsBuffer: ctx.vertexBuffer({ data: geometry.uvs }),
    indexBuffer: ctx.indexBuffer({ data: geometry.cells })
  };

  triangleMesh.optsUniformBindGroup = ctx.bindGroup({
    layout: optsUniformsBindGroupLayout,
    bindings: [{ buffer: triangleMesh.optsUniformBuffer }]
  });

  triangleMesh.pipeline = ctx.pipeline({
    vert: vertexShaderMeshGLSL,
    frag: fragmentShaderMeshGLSL,
    bindGroupLayouts: [uniformsBindGroupLayout, optsUniformsBindGroupLayout]
  });

  triangleMesh.drawCmd = {
    pipeline: triangleMesh.pipeline,
    attributes: [
      // TODO: this should be called vertexBuffers
      triangleMesh.vertexBuffer,
      triangleMesh.uvsBuffer
    ],
    indices: triangleMesh.indexBuffer, // TODO: this should be called indexBuffer
    uniforms: [
      // TODO: this should be called bindGroups
      shared.uniformBindGroup,
      triangleMesh.optsUniformBindGroup
    ],
    count: geometry.cells.length * 3
  };

  // VOXEL MESH

  const voxelMesh = {
    optsUniformBuffer: ctx.uniformBuffer({ size: mat4Size + vec2Size }),
    uniformBindGroup: null,
    pipeline: null,
    drawCmd: null,
    modelMatrix: new Float32Array(16),
    vertexBuffer: ctx.vertexBuffer({ data: cube.positions }),
    uvsBuffer: ctx.vertexBuffer({ data: cube.uvs }),
    indexBuffer: ctx.indexBuffer({ data: cube.cells }),
    voxelsBuffer: ctx.vertexBuffer({ data: voxels }), // usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE }),
    voxelsColorBuffer: ctx.vertexBuffer({ data: voxelColors }) //, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE })
  };

  const image = await loadImage("assets/subsurface.png");
  const texture = ctx.texture({ data: image });

  const sampler = ctx.sampler({
    min: ctx.Filter.Linear,
    mag: ctx.Filter.Linear,
    mipmap: true
  });

  voxelMesh.optsUniformBindGroup = ctx.bindGroup({
    layout: optsVoxelUniformsBindGroupLayout,
    bindings: [{ buffer: voxelMesh.optsUniformBuffer }, sampler, texture ]
  });

  voxelMesh.pipeline = ctx.pipeline({
    vert: vertexShaderGLSL,
    frag: fragmentShaderGLSL,
    bindGroupLayouts: [uniformsBindGroupLayout, optsVoxelUniformsBindGroupLayout],
    vertexState: {
      vertexBuffers: [
        {
          arrayStride: 3 * 4,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: "float3"
            }
          ]
        },
        {
          arrayStride: 2 * 4,
          attributes: [
            {
              // uvs
              shaderLocation: 1,
              offset: 0,
              format: "float2"
            }
          ]
        },
        {
          // instanced particles buffer
          arrayStride: 1 * 4,
          stepMode: "instance",
          attributes: [
            {
              shaderLocation: 2,
              offset: 0,
              format: "float"
            }
          ]
        },
        {
          // instanced particles colorbuffer
          arrayStride: 4 * 4,
          stepMode: "instance",
          attributes: [
            {
              shaderLocation: 3,
              offset: 0,
              format: "float4"
            }
          ]
        }
      ]
    }
  });


  const depthTexture = ctx.texture({
    width: ctx.canvas.width,
    height: ctx.canvas.height,
    format: ctx.PixelFormat.Depth24PlusStencil18
  });

  const pass = ctx.pass({
    clearColor: [0.2, 0.2, 0.2, 1],
    depth: depthTexture,
    clearDepth: 1
  });

  const renderPassCmd = {
    pass: pass
  };

 
  
  voxelMesh.drawCmd = {
    pass: pass,
    pipeline: voxelMesh.pipeline,
    attributes: [
      // TODO: this should be called vertexBuffers
      voxelMesh.vertexBuffer,
      voxelMesh.uvsBuffer,
      voxelMesh.voxelsBuffer,
      voxelMesh.voxelsColorBuffer
    ],
    indices: voxelMesh.indexBuffer, // TODO: this should be called indexBuffer
    uniforms: [
      // TODO: this should be called bindGroups
      shared.uniformBindGroup,
      voxelMesh.optsUniformBindGroup
    ],
    count: cube.cells.length * 3,
    instances: numVoxels
  };

  // OTHER

  let projectionMatrix = new Float32Array(16);
  mat4.perspective(
    projectionMatrix,
    Math.PI / 2,
    ctx.canvas.width / ctx.canvas.height,
    0.1,
    100.0
  );

 

  // voxelization

  // Create UBO with uniform params of the voxelization algorithm
  const voxelizeSurfaceFrontData = new Float32Array([gridSize, gridResolution]);
  const voxelizeSurfaceFrontUniformBuffer = ctx.uniformBuffer({
    size: voxelizeSurfaceFrontData.byteLength
  });
  ctx.update(voxelizeSurfaceFrontUniformBuffer, {
    offset: 0,
    data: voxelizeSurfaceFrontData
  });

  // Create storage buffer to keep our computed voxels data
  // This can be vetex buffer just we we do with boids but currently i'm not sure if it's going to be readable
  const [
    voxelsComputeBuffer,
    voxelsComputeBufferDataArray
  ] = ctx.device.createBufferMapped({
    size: voxels.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });
  new Float32Array(voxelsComputeBufferDataArray).set(voxels);
  voxelsComputeBuffer.unmap();

  // Create storage buffer to keep our computed voxels data
  // This can be vetex buffer just we we do with boids but currently i'm not sure if it's going to be readable
  const [
    voxelsColorComputeBuffer,
    voxelsColorComputeBufferDataArray
  ] = ctx.device.createBufferMapped({
    size: voxels.byteLength * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });
  new Float32Array(voxelsColorComputeBufferDataArray).set(
    new Float32Array(voxelColors)
  );
  voxelsColorComputeBuffer.unmap();

  const [
    voxelsBlurredColorComputeBuffer,
    voxelsBlurredColorComputeBufferDataArray
  ] = ctx.device.createBufferMapped({
    size: voxels.byteLength * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });
  new Float32Array(voxelsBlurredColorComputeBufferDataArray).set(
    new Float32Array(voxelColors)
  );
  voxelsBlurredColorComputeBuffer.unmap();

  // create layout of our data
  const voxelizeSurfaceFrontBindLayout = ctx.bindGroupLayout([
    // voxelizeSurfaceFrontData goes here
    {
      visibility: ctx.ShaderStage.Compute,
      type: ctx.BindingType.UniformBuffer
    },
    // voxelsComputeBuffer goes here
    {
      visibility: ctx.ShaderStage.Compute,
      type: ctx.BindingType.StorageBuffer
    },
    // voxelsColorComputeBuffer goes here
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.StorageBuffer }
  ]);

  // // create layout of our data
  const voxelizeSurfaceFrontBlurBindLayout = ctx.bindGroupLayout([
    // voxelizeSurfaceFrontData goes here
    {
      visibility: ctx.ShaderStage.Compute,
      type: ctx.BindingType.UniformBuffer
    },
    // voxelsComputeBuffer goes here
    {
      visibility: ctx.ShaderStage.Compute,
      type: ctx.BindingType.StorageBuffer
    },
    // voxelsColorComputeBuffer goes here
    {
      visibility: ctx.ShaderStage.Compute,
      type: ctx.BindingType.StorageBuffer
    },
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.StorageBuffer }
  ]);

  // bind values to our data
  const voxelizeSurfaceFrontBindGroup = ctx.bindGroup({
    layout: voxelizeSurfaceFrontBindLayout,
    bindings: [
      { buffer: voxelizeSurfaceFrontUniformBuffer },
      { buffer: voxelsComputeBuffer },
      { buffer: voxelsColorComputeBuffer }
    ]
  });

  const voxelizeSurfaceFrontBlurBindGroup = ctx.bindGroup({
    layout: voxelizeSurfaceFrontBlurBindLayout,
    bindings: [
      { buffer: voxelizeSurfaceFrontUniformBuffer },
      { buffer: voxelsComputeBuffer },
      { buffer: voxelsColorComputeBuffer },
      { buffer: voxelsBlurredColorComputeBuffer }
    ]
  });

  const voxelizeSurfaceFrontComputePipeline = ctx.computePipeline({
    compute: voxelizeSurfaceFrontComputeGLSL,
    bindGroupLayouts: [voxelizeSurfaceFrontBindLayout]
  });

  const voxelizeSurfaceBlurComputePipeline = ctx.computePipeline({
    compute: voxelizeSurfaceBlurComputeGLSL,
    bindGroupLayouts: [voxelizeSurfaceFrontBlurBindLayout]
  });

  const device = ctx.device;
  let computeCommandEncoder = device.createCommandEncoder();

  const voxelizePass = computeCommandEncoder.beginComputePass();
  voxelizePass.setPipeline(voxelizeSurfaceFrontComputePipeline);
  voxelizePass.setBindGroup(0, voxelizeSurfaceFrontBindGroup);
  voxelizePass.dispatch(N, N, N);
  voxelizePass.endPass();

  let gpuVoxelReadBuffer = device.createBuffer({
    size: voxels.byteLength * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  // Encode commands for copying buffer to buffer.
  computeCommandEncoder.copyBufferToBuffer(
    voxelsColorComputeBuffer,
    0,
    gpuVoxelReadBuffer,
    0,
    voxels.byteLength * 4
  );

  device.defaultQueue.submit([computeCommandEncoder.finish()]);

  let voxelArrayBuffer = await gpuVoxelReadBuffer.mapReadAsync();
  
  computeCommandEncoder = device.createCommandEncoder();
  const voxelizePass2 = computeCommandEncoder.beginComputePass();
  voxelizePass2.setPipeline(voxelizeSurfaceBlurComputePipeline);
  voxelizePass2.setBindGroup(0, voxelizeSurfaceFrontBlurBindGroup);
  voxelizePass2.dispatch(N, N, N);
  voxelizePass2.endPass();

  gpuVoxelReadBuffer = device.createBuffer({
    size: voxels.byteLength * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  // Encode commands for copying buffer to buffer.
  computeCommandEncoder.copyBufferToBuffer(
    voxelsBlurredColorComputeBuffer,
    0,
    gpuVoxelReadBuffer,
    0,
    voxels.byteLength * 4
  );

  device.defaultQueue.submit([computeCommandEncoder.finish()]);

  // Submit GPU commands.
  voxelArrayBuffer = await gpuVoxelReadBuffer.mapReadAsync();
  
  // voxelColors = new Float32Array(voxelArrayBuffer);
  
  console.log("voxels result", voxelColors[0]);
  voxelColors = new Float32Array(voxelArrayBuffer)
  // ctx.update(voxelMesh.voxelsColorBuffer, { offset: 0, data: voxelColors });

  /*---------------------------------------------*/

  console.log("init done");
  function render(time) {
    // ctx.submit(renderPassCmd, () => {
      // ctx.submit(triangleMesh.drawCmd);
      ctx.submit(voxelMesh.drawCmd);
    // });

    ctx.update(shared.uniformBuffer, {
      offset: 0,
      data: new Float32Array(camera.projectionMatrix)
    }); //TODO: GC

    ctx.update(shared.uniformBuffer, {
      offset: mat4Size,
      data: new Float32Array(camera.viewMatrix)
    }); //TODO: GC

    mat4.identity(triangleMesh.modelMatrix);
    // mat4.rotate(triangleMesh.modelMatrix, time / 1000, [0, 1, 0]);

    // TODO: uniform updates should be batched somehow
    ctx.update(triangleMesh.optsUniformBuffer, {
      offset: 0,
      data: triangleMesh.modelMatrix
    });
    ctx.update(triangleMesh.optsUniformBuffer, {
      offset: mat4Size,
      data: new Float32Array([1, 1])
    }); //TODO: GC

    mat4.identity(voxelMesh.modelMatrix);
    // mat4.rotate(voxelMesh.modelMatrix, time / 1000, [0, 1, 0]);

    ctx.update(voxelMesh.optsUniformBuffer, {
      offset: 0,
      data: voxelMesh.modelMatrix
    });
    ctx.update(voxelMesh.optsUniformBuffer, {
      offset: mat4Size,
      data: new Float32Array([4, 1])
    }); //TODO: GC
  }

  ctx.frame(render);
}

init();
