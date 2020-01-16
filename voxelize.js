const createCube = require("primitive-cube");
const createTorus = require("primitive-torus");
const { mat4, utils } = require("pex-math");
const { clamp, map } = utils
const createContext = require("./context");
const random = require("pex-random");
const loadImage = require("./load-image");
const voxelize = require('voxelize')
// const voxelize = require('./voxelize-mesh.js')
const {
  perspective: createCamera,
  orbiter: createOrbiter
} = require("pex-cam");
const bunny = require('bunny')
const centerAndNormalize = require('geom-center-and-normalize')
const normalizedPositions = centerAndNormalize(bunny.positions)
const mesh = {
  ...bunny,
  uvs: normalizedPositions.map((p) => [p[0] * 2 + 1, p[1] * 2 + 1]),
  positions: normalizedPositions
}

function minMax () {
  return {
    min: Infinity,
    max: -Infinity,
    add: function (v) {
      this.min = Math.min(this.min, v)
      this.max = Math.max(this.max, v)
    }
  }
}

const gridSize = 1
const gridResolution = 64
const step = gridSize / gridResolution
const numVoxels = gridResolution * gridResolution * gridResolution
let voxels = new Float32Array(numVoxels)
let voxelColors = new Array(numVoxels * 4).fill(0).map(() => Math.random())
const N = gridResolution;

console.time('voxelize on cpu')
const voxelData = voxelize(mesh.cells, mesh.positions, step)
// const voxelData = voxelize(mesh.cells, mesh.positions, gridSize, gridResolution)
console.log('voxelData', voxelData)
for (var i = 0; i < voxelData.voxels.shape[0]; i++) {
  for (var j = 0; j < voxelData.voxels.shape[1]; j++) {
    for (var k = 0; k < voxelData.voxels.shape[2]; k++) {
      var ix = i + Math.floor((N - voxelData.voxels.shape[0]) / 2)
      var iy = j + Math.floor((N - voxelData.voxels.shape[1]) / 2)
      var iz = k + Math.floor((N - voxelData.voxels.shape[2]) / 2)
      // var x = voxelData.resolution * i + voxelData.origin[0]
      // var y = voxelData.resolution * j + voxelData.origin[1]
      // var z = voxelData.resolution * k + voxelData.origin[2]      
      // ix = Math.floor(clamp(map(x, -gridSize / 2, gridSize / 2, 0, 1), 0, 1) * (N - 1))
      // iy = Math.floor(clamp(map(y, -gridSize / 2, gridSize / 2, 0, 1), 0, 1) * (N - 1))
      // iz = Math.floor(clamp(map(z, -gridSize / 2, gridSize / 2, 0, 1), 0, 1) * (N - 1))
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

const vertexShaderGLSL = `
	#version 450
    layout(set = 0, binding = 0) uniform Uniforms {
      mat4 projectionMatrix;
      mat4 viewMatrix;      
    } uniforms;

    layout(set = 1, binding = 0) uniform OptsUniforms {
      mat4 modelMatrix;
      vec2 uvScale;      
    } optsUniforms;

    layout(location = 0) in vec3 position;
    layout(location = 1) in vec2 uv;
    layout(location = 2) in float voxel;
    layout(location = 3) in vec4 voxelColor;
    layout(location = 0) out vec2 vUv;
    layout(location = 1) out vec4 vColor;
	  void main() {
    vUv = uv * optsUniforms.uvScale;
    vec3 pos = position;
    float size = ${gridSize};
    float N = ${gridResolution};
    float step = size / N;
    float x = mod(gl_InstanceIndex, N);        
    float y = floor(gl_InstanceIndex / (N * N));
    float z = mod(floor(gl_InstanceIndex / (N)), N);
    vColor = voxelColor;
    float offset = size * (N / 2.0 - 0.5) / N;    
    pos.x += x * step - offset;
    pos.y += y * step - offset;
    pos.z += z * step - offset;
    pos *= voxel;
		gl_Position = uniforms.projectionMatrix * uniforms.viewMatrix * optsUniforms.modelMatrix * vec4(pos, 1.0);
	}
`;

const fragmentShaderGLSL = `
  #version 450
  layout(location = 0) in vec2 vUv;
  layout(location = 1) in vec4 vColor;
  layout(location = 0) out vec4 outColor;
  void main() {
    outColor = vec4(vUv, 0.0, 1.0);    
    outColor = vColor;
	}
`;

const vertexShaderMeshGLSL = `
	#version 450
    layout(set = 0, binding = 0) uniform Uniforms {
      mat4 projectionMatrix;
      mat4 viewMatrix;      
    } uniforms;
    layout(set = 1, binding = 0) uniform OptsUniforms {
      mat4 modelMatrix;
    } optsUniforms;
    layout(location = 0) in vec3 position;
    layout(location = 1) in vec2 uv;
    layout(location = 0) out vec2 vUv;
	  void main() {
    vUv = uv;
		gl_Position = uniforms.projectionMatrix * uniforms.viewMatrix * optsUniforms.modelMatrix * vec4(position, 1.0);
	}
`;

const computeShaderGLSL = `#version 450
  layout(std430, set = 0, binding = 0) readonly buffer FirstMatrix {
      vec2 size;
      float numbers[];
  } firstMatrix;

  layout(std430, set = 0, binding = 1) readonly buffer SecondMatrix {
      vec2 size;
      float numbers[];
  } secondMatrix;

  layout(std430, set = 0, binding = 2) buffer ResultMatrix {
      vec2 size;
      float numbers[];
  } resultMatrix;

  void main() {
    resultMatrix.size = vec2(firstMatrix.size.x, secondMatrix.size.y);

    ivec2 resultCell = ivec2(gl_GlobalInvocationID.x, gl_GlobalInvocationID.y);
    float result = 0.0;
    for (int i = 0; i < firstMatrix.size.y; i++) {
      int a = i + resultCell.x * int(firstMatrix.size.y);
      int b = resultCell.y + i * int(secondMatrix.size.y);
      result += firstMatrix.numbers[a] * secondMatrix.numbers[b];
    }

    int index = resultCell.y + resultCell.x * int(secondMatrix.size.y);
    resultMatrix.numbers[index] = result;
  }
`;

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

  let vertexBufferMesh = ctx.vertexBuffer({ data: mesh.positions });
  let uvsBufferMesh = ctx.vertexBuffer({ data: mesh.uvs });
  let indexBufferMesh = ctx.indexBuffer({ data: mesh.cells });

  const mat4Size = 16 * Float32Array.BYTES_PER_ELEMENT;
  const vec2Size = 2 * Float32Array.BYTES_PER_ELEMENT;
  const uniformBuffer = ctx.uniformBuffer({
    size: mat4Size * 2 //offset must be 256-byte aligned? More https://github.com/gpuweb/gpuweb/issues/116
  });

  const optsUniformBuffer = ctx.uniformBuffer({
    size: mat4Size + vec2Size
  });

  const optsUniformBufferMesh = ctx.uniformBuffer({
    size: mat4Size + vec2Size
  });

  const uniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer }
  ]);

  const optsUniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer }
  ]);

  const uniformBindGroup = ctx.bindGroup({
    layout: uniformsBindGroupLayout,
    bindings: [{ buffer: uniformBuffer }]
  });

  const optsUniformBindGroup = ctx.bindGroup({
    layout: optsUniformsBindGroupLayout,
    bindings: [{ buffer: optsUniformBuffer }]
  });

  const optsUniformBindGroupMesh = ctx.bindGroup({
    layout: optsUniformsBindGroupLayout,
    bindings: [{ buffer: optsUniformBufferMesh }]
  });

  
  const pipeline = ctx.pipeline({
    vert: vertexShaderMeshGLSL,
    frag: fragmentShaderGLSL,
    bindGroupLayouts: [uniformsBindGroupLayout, optsUniformsBindGroupLayout]
  });
  
  console.log('pipeline')
  const instancedCubePipeline = ctx.pipeline({
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
  console.log('pipeline2')

  let projectionMatrix = new Float32Array(16);
  let modelMatrix = new Float32Array(16);
  let modelMatrixMesh = new Float32Array(16);
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

  const drawVoxelsCmd = {
    pipeline: instancedCubePipeline,
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
      uniformBindGroup,
      optsUniformBindGroup
    ],
    count: cube.cells.length * 3,
    instances: numVoxels
  };

  const drawMeshCmd = {
    pipeline: pipeline,
    attributes: [
      // TODO: this should be called vertexBuffers
      vertexBufferMesh,
      uvsBufferMesh
    ],
    indices: indexBufferMesh, // TODO: this should be called indexBuffer
    uniforms: [
      // TODO: this should be called bindGroups
      uniformBindGroup,
      optsUniformBindGroupMesh
    ],
    count: mesh.cells.length * 3
  };

  const renderPassCmd = {
    pass: pass
  };

  // compute

  // rows, columns, ...data
  const firstMatrix = new Float32Array([2, 4, 1, 2, 3, 4, 5, 6, 7, 8]);

  const [
    gpuBufferFirstMatrix,
    arrayBufferFirstMatrix
  ] = ctx.device.createBufferMapped({
    size: firstMatrix.byteLength,
    usage: GPUBufferUsage.STORAGE
  });
  new Float32Array(arrayBufferFirstMatrix).set(firstMatrix);
  gpuBufferFirstMatrix.unmap();

  // Second Matrix

  const secondMatrix = new Float32Array([4, 2, 1, 2, 3, 4, 5, 6, 7, 8]);

  const [
    gpuBufferSecondMatrix,
    arrayBufferSecondMatrix
  ] = ctx.device.createBufferMapped({
    size: secondMatrix.byteLength,
    usage: GPUBufferUsage.STORAGE
  });
  new Float32Array(arrayBufferSecondMatrix).set(secondMatrix);
  gpuBufferSecondMatrix.unmap();

  // Result Matrix

  const resultMatrixBufferSize =
    Float32Array.BYTES_PER_ELEMENT * (2 + firstMatrix[0] * secondMatrix[1]);
  const resultMatrixBuffer = ctx.device.createBuffer({
    size: resultMatrixBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC //TODO: why copy src?
  });

  const computeBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.ReadOnlyStorageBuffer },
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.ReadOnlyStorageBuffer },
    { visibility: ctx.ShaderStage.Compute, type: ctx.BindingType.StorageBuffer }    
  ]);

  const computeBindGroup = ctx.bindGroup({
    layout: computeBindGroupLayout,
    bindings: [
      { buffer: gpuBufferFirstMatrix },
      { buffer: gpuBufferSecondMatrix },
      { buffer: resultMatrixBuffer }
    ]
  });

  const computePipeline = ctx.computePipeline({
    compute: computeShaderGLSL,
    bindGroupLayouts: [computeBindGroupLayout]
  });

  const computeCmd = {
    pipeline: computePipeline,
    uniforms: [
      // TODO: this should be called bindGroups
      computeBindGroup
    ],
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

  const voxelizeSurfaceFrontComputeGLSL = `#version 450
  layout(std140, set = 0, binding = 0) uniform Params {
      float gridSize;
      float gridResolution;
  } params;

  layout(std430, set = 0, binding = 1) buffer VoxelData {
    float voxels[${numVoxels}];
  } voxelData;

  layout(std430, set = 0, binding = 2) buffer VoxelColorData {
    vec4 colors[${numVoxels}];
  } voxelColorData;

  void main() {
    ivec3 resultCell = ivec3(gl_GlobalInvocationID.x, gl_GlobalInvocationID.y, gl_GlobalInvocationID.z);
    float result = 0.0;
    int N = int(params.gridResolution);
    int index = resultCell.x + resultCell.z * N + resultCell.y * N * N;
    float fy = gl_GlobalInvocationID.y / float(N);
    result = cos(gl_GlobalInvocationID.z * 3.14 / 30.0) * 0.5 + 0.5;

    int numSteps = N;

    int count = 0;
    for (int z = resultCell.z; z < N; z++) {
      int index = resultCell.x + z * N + resultCell.y * N * N;
      if (voxelData.voxels[index] > 0.0) {
        count++;
      } else {        
        break;
      }
    }
    
    voxelColorData.colors[index] = vec4(max(0.0, 1.0 - count / 10.0));
  }
`;

console.log('compute pipeline coming')

  const voxelizeSurfaceFrontComputePipeline = ctx.computePipeline({
    compute: voxelizeSurfaceFrontComputeGLSL,
    bindGroupLayouts: [voxelizeSurfaceFrontBindLayout]
  });

  console.log('compute pipeline coming with error?')

  const device = ctx.device
  const commandEncoder = device.createCommandEncoder();

  const voxelizePass = commandEncoder.beginComputePass();
  voxelizePass.setPipeline(voxelizeSurfaceFrontComputePipeline);
  voxelizePass.setBindGroup(0, voxelizeSurfaceFrontBindGroup);
  voxelizePass.dispatch(N, N, N);
  voxelizePass.endPass();

  console.log('ended voxelization')

  /*---------------------------------------------*/
  

  //TODO: beginRenderPass takes description, computePass takes nothing
  //so if i create compute pass object it would be just empty type
  //i can also just detect GPUComputePipeline inside submit?
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, computeBindGroup);
  // dispatch instead of draw
  passEncoder.dispatch(firstMatrix[0] /* x */, secondMatrix[1] /* y */);
  passEncoder.endPass();

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

  /*
  // Get a GPU buffer for reading in an unmapped state.
  const gpuReadBuffer = device.createBuffer({
    size: resultMatrixBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  // Encode commands for copying buffer to buffer.
  commandEncoder.copyBufferToBuffer(
    resultMatrixBuffer, // source buffer
    0, // source offset
    gpuReadBuffer /* destination buffer,
    0, //destination offset
    resultMatrixBufferSize
  );

  // Submit GPU commands.
  const gpuCommands = commandEncoder.finish();
  device.defaultQueue.submit([gpuCommands]);
  const arrayBuffer = await gpuReadBuffer.mapReadAsync();
  console.log('compute result', new Float32Array(arrayBuffer));
  */
  // yay it works
  // next step: check out boids: https://github.com/austinEng/webgpu-samples/blob/master/src/examples/computeBoids.ts
  // next step: learn about workgroups

  console.log('ended text compute')

  /*---------------------------------------------*/

  console.log('init done')
  function render(time) {
    ctx.submit(renderPassCmd, () => {
      ctx.submit(drawVoxelsCmd);
      // ctx.submit(drawMeshCmd);
    });

    ctx.update(uniformBuffer, {
      offset: 0,
      data: new Float32Array(camera.projectionMatrix)
    }); //TODO: GC
    ctx.update(uniformBuffer, {
      offset: mat4Size,
      data: new Float32Array(camera.viewMatrix)
    }); //TODO: GC

    mat4.identity(modelMatrix);
    mat4.rotate(modelMatrix, time / 1000, [0, 1, 0]);

    mat4.identity(modelMatrixMesh);
    mat4.rotate(modelMatrixMesh, time / 1000, [0, 1, 0]);    

    // TODO: uniform updates should be batched somehow
    ctx.update(optsUniformBuffer, { offset: 0, data: modelMatrix });
    ctx.update(optsUniformBuffer, {
      offset: mat4Size,
      data: new Float32Array([1, 1])
    }); //TODO: GC

    ctx.update(optsUniformBufferMesh, { offset: 0, data: modelMatrixMesh });
    ctx.update(optsUniformBufferMesh, {
      offset: mat4Size,
      data: new Float32Array([4, 1])
    }); //TODO: GC
  }

  ctx.frame(render);
}

init();
