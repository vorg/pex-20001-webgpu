const createCube = require("primitive-cube");
const { mat4, utils } = require("pex-math");
const createContext = require("./context");
const voxelize = require('voxelize')
const {
  perspective: createCamera,
  orbiter: createOrbiter
} = require("pex-cam");
const bunny = require('bunny')
const centerAndNormalize = require('geom-center-and-normalize')
const normalizedPositions = centerAndNormalize(bunny.positions)
const geometry = {
  ...bunny,
  uvs: normalizedPositions.map((p) => [p[0] * 2 + 1, p[1] * 2 + 1]),
  positions: normalizedPositions
}

const gridSize = 1
const gridResolution = 64
const step = gridSize / gridResolution
const numVoxels = gridResolution * gridResolution * gridResolution
let voxels = new Float32Array(numVoxels)
let voxelColors = new Array(numVoxels * 4).fill(0).map(() => Math.random())
const N = gridResolution;

const {
  vertexShaderGLSL,
  fragmentShaderGLSL,
  vertexShaderMeshGLSL,
  computeShaderGLSL,
  voxelizeSurfaceFrontComputeGLSL,
  voxelizeSurfaceBlurComputeGLSL
} = require('./voxelize-shaders')

console.time('voxelize on cpu')
const voxelData = voxelize(geometry.cells, geometry.positions, step)
// const voxelData = voxelize(mesh.cells, mesh.positions, gridSize, gridResolution)
console.log('voxelData', voxelData)

for (var i = 0; i < voxelData.voxels.shape[0]; i++) {
  for (var j = 0; j < voxelData.voxels.shape[1]; j++) {
    for (var k = 0; k < voxelData.voxels.shape[2]; k++) {
      var ix = i + Math.floor((N - voxelData.voxels.shape[0]) / 2)
      var iy = j + Math.floor((N - voxelData.voxels.shape[1]) / 2)
      var iz = k + Math.floor((N - voxelData.voxels.shape[2]) / 2)
      var val = voxelData.voxels.get(i, j, k)
      var index = ix + iz * N + iy * N * N      
      voxels[index] = val
    }
  }
}
console.timeEnd('voxelize on cpu')

// for (let i = 0; i < numVoxels; i++) {
//   let x = i % N;        
//   let y = Math.floor(i / (N * N));
//   let z = Math.floor(i / (N)) % N;
//   x /= 15
//   y /= 15
//   z /= 15
//   var value = 0
//   if (x == 0) value = 1
//   voxels[i] = value
//   //voxels[i] = (random.noise3(x, y, z) > 0) ? 1 : 0
// }

console.log('voxels', voxels)

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

  let cube = createCube(gridSize / gridResolution * 0.9);
  
  let vertexBuffer = ctx.vertexBuffer({ data: cube.positions });
  let uvsBuffer = ctx.vertexBuffer({ data: cube.uvs });
  let indexBuffer = ctx.indexBuffer({ data: cube.cells });
  let voxelsBuffer = ctx.vertexBuffer({ data: voxels })//, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE });
  let voxelsColorBuffer = ctx.vertexBuffer({ data: voxelColors })//, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE });

  let vertexBufferMesh = ctx.vertexBuffer({ data: geometry.positions });
  let uvsBufferMesh = ctx.vertexBuffer({ data: geometry.uvs });
  let indexBufferMesh = ctx.indexBuffer({ data: geometry.cells });

  const mat4Size = 16 * Float32Array.BYTES_PER_ELEMENT;
  const vec2Size = 2 * Float32Array.BYTES_PER_ELEMENT;

  // SHARED

  const uniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer }
  ]);

  const optsUniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer }
  ]);  

  const shared = {
    uniformBuffer: ctx.uniformBuffer({ size: mat4Size * 2 }),
    uniformBindGroup: null
  }

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
    modelMatrix: new Float32Array(16)
  }

  triangleMesh.optsUniformBindGroup = ctx.bindGroup({
    layout: optsUniformsBindGroupLayout,
    bindings: [{ buffer: triangleMesh.optsUniformBuffer }]
  });

  triangleMesh.pipeline = ctx.pipeline({
    vert: vertexShaderMeshGLSL,
    frag: fragmentShaderGLSL,
    bindGroupLayouts: [uniformsBindGroupLayout, optsUniformsBindGroupLayout]
  });

  // VOXEL MESH

  const voxelMesh = {
    optsUniformBuffer: ctx.uniformBuffer({ size: mat4Size + vec2Size }),
    uniformBindGroup: null,
    pipeline: null,
    drawCmd: null,
    modelMatrix: new Float32Array(16)
  }

  voxelMesh.optsUniformBindGroup = ctx.bindGroup({
    layout: optsUniformsBindGroupLayout,
    bindings: [{ buffer: voxelMesh.optsUniformBuffer }]
  });

  voxelMesh.pipeline = ctx.pipeline({
    vert: vertexShaderGLSL,
    frag: fragmentShaderGLSL,
    bindGroupLayouts: [uniformsBindGroupLayout, optsUniformsBindGroupLayout],
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
              format: "float"
            }           
          ]
        }
      ]
    }
  });


  triangleMesh.drawCmd = {
    pipeline: triangleMesh.pipeline,
    attributes: [
      // TODO: this should be called vertexBuffers
      vertexBufferMesh,
      uvsBufferMesh
    ],
    indices: indexBufferMesh, // TODO: this should be called indexBuffer
    uniforms: [
      // TODO: this should be called bindGroups
      triangleMesh.uniformBindGroup,
      triangleMesh.optsUniformBindGroupMesh
    ],
    count: geometry.cells.length * 3
  };

  voxelMesh.drawCmd = {
    pipeline: voxelMesh.pipeline,
    attributes: [
      // TODO: this should be called vertexBuffers
      vertexBuffer,
      uvsBuffer,
      voxelsBuffer,
      voxelsColorBuffer
    ],
    indices: indexBuffer, // TODO: this should be called indexBuffer
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

  // voxelization

  // Create UBO with uniform params of the voxelization algorithm
  const voxelizeSurfaceFrontData = new Float32Array([
    gridSize,
    gridResolution
  ])
  const voxelizeSurfaceFrontUniformBuffer = ctx.uniformBuffer({
    size: voxelizeSurfaceFrontData.byteLength
  });
  ctx.update(voxelizeSurfaceFrontUniformBuffer, { offset: 0, data: voxelizeSurfaceFrontData});

  // Create storage buffer to keep our computed voxels data
  // This can be vetex buffer just we we do with boids but currently i'm not sure if it's going to be readable
  const [
    voxelsComputeBuffer,
    voxelsComputeBufferDataArray,
  ] = ctx.device.createBufferMapped({
    size: voxels.byteLength,
    usage: GPUBufferUsage.STORAGE  | GPUBufferUsage.COPY_SRC
  });
  new Float32Array(voxelsComputeBufferDataArray).set(voxels);
  voxelsComputeBuffer.unmap();

  // Create storage buffer to keep our computed voxels data
  // This can be vetex buffer just we we do with boids but currently i'm not sure if it's going to be readable
  const [
    voxelsColorComputeBuffer,
    voxelsColorComputeBufferDataArray,
  ] = ctx.device.createBufferMapped({
    size: voxels.byteLength * 4,
    usage: GPUBufferUsage.STORAGE  | GPUBufferUsage.COPY_SRC
  });
  new Float32Array(voxelsColorComputeBufferDataArray).set(new Float32Array(voxelColors));
  voxelsColorComputeBuffer.unmap();

  // create layout of our data
  const voxelizeSurfaceFrontBindLayout = ctx.bindGroupLayout([
    // voxelizeSurfaceFrontData goes here
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.UniformBuffer },
    // voxelsComputeBuffer goes here
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.StorageBuffer },    
    // voxelsColorComputeBuffer goes here
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

  const voxelizeSurfaceFrontComputePipeline = ctx.computePipeline({
    compute: voxelizeSurfaceFrontComputeGLSL,
    bindGroupLayouts: [voxelizeSurfaceFrontBindLayout]
  });

  // const voxelizeSurfaceBlurComputePipeline = ctx.computePipeline({
  //   compute: voxelizeSurfaceBlurComputeGLSL,
  //   bindGroupLayouts: [voxelizeSurfaceFrontBindLayout]
  // });

  const device = ctx.device
  const commandEncoder = device.createCommandEncoder();

  const voxelizePass = commandEncoder.beginComputePass();
  voxelizePass.setPipeline(voxelizeSurfaceFrontComputePipeline);
  voxelizePass.setBindGroup(0, voxelizeSurfaceFrontBindGroup);
  voxelizePass.dispatch(N, N, N);
  voxelizePass.endPass();

  // const voxelizePass2 = commandEncoder.beginComputePass();
  // voxelizePass2.setPipeline(voxelizeSurfaceBlurComputePipeline);
  // voxelizePass2.setBindGroup(0, voxelizeSurfaceFrontBindGroup);
  // voxelizePass2.dispatch(N, N, N);
  // voxelizePass2.endPass();

  console.log('ended voxelization')

  /*---------------------------------------------*/
  

  

  const gpuVoxelReadBuffer = device.createBuffer({
    size: voxels.byteLength * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  // Encode commands for copying buffer to buffer.
  commandEncoder.copyBufferToBuffer(
    voxelsColorComputeBuffer /* source buffer */,
    0 /* source offset */,
    gpuVoxelReadBuffer /* destination buffer */,
    0 /* destination offset */,
    voxels.byteLength * 4 /* size */
  );


  console.log('finished reading colors voxelization')

  // Submit GPU commands.
  const gpuComputeCommands = commandEncoder.finish();
  device.defaultQueue.submit([gpuComputeCommands]);
  const voxelArrayBuffer = await gpuVoxelReadBuffer.mapReadAsync();
  voxelsColors = new Float32Array(voxelArrayBuffer)
  console.log('voxels result', voxelsColors);
  // voxelsColors = new Float32Array(voxelArrayBuffer)
  ctx.update(voxelsColorBuffer, { offset: 0, data: voxelsColors })

  console.log('ended update')
  // old compute

  console.log('ended text compute')

  /*---------------------------------------------*/

  console.log('init done')
  function render(time) {
    ctx.submit(renderPassCmd, () => {
      // ctx.submit(triangleMesh.drawCmd);      
      ctx.submit(voxelMesh.drawCmd);      
    });

    ctx.update(shared.uniformBuffer, {
      offset: 0,
      data: new Float32Array(camera.projectionMatrix)
    }); //TODO: GC

    ctx.update(shared.uniformBuffer, {
      offset: mat4Size,
      data: new Float32Array(camera.viewMatrix)
    }); //TODO: GC


    mat4.identity(triangleMesh.modelMatrix);
    mat4.rotate(triangleMesh.modelMatrix, time / 1000, [0, 1, 0]);

    // TODO: uniform updates should be batched somehow
    ctx.update(triangleMesh.optsUniformBuffer, { offset: 0, data: triangleMesh.modelMatrix });
    ctx.update(triangleMesh.optsUniformBuffer, {
      offset: mat4Size,
      data: new Float32Array([1, 1])
    }); //TODO: GC

    mat4.identity(voxelMesh.modelMatrix);
    mat4.rotate(voxelMesh.modelMatrix, time / 1000, [0, 1, 0]);    

    ctx.update(voxelMesh.optsUniformBuffer, { offset: 0, data: voxelMesh.modelMatrix });
    ctx.update(voxelMesh.optsUniformBuffer, {
      offset: mat4Size,
      data: new Float32Array([4, 1])
    }); //TODO: GC
  }

  ctx.frame(render);
}

init();
