const createCube = require("primitive-cube");
const createSphere = require("primitive-sphere");
const createTorus = require("primitive-torus");
const { mat4 } = require("pex-math");
const createContext = require("./context");
const loadImage = require("./load-image");

const vertexShaderGLSL = `
	#version 450
    layout(set=0,binding = 0) uniform Uniforms {
        mat4 projectionMatrix;
        mat4 modelMatrix;
    } uniforms;
    layout(location = 0) in vec3 position;
    layout(location = 1) in vec2 uv;
    layout(location = 0) out vec2 vUv;
	void main() {
        vUv = uv;
		gl_Position = uniforms.projectionMatrix * uniforms.modelMatrix * vec4(position, 1.0);
	}
	`;
const fragmentShaderGLSL = `
    #version 450
    layout(location = 0) in vec2 vUv;
    layout(location = 0) out vec4 outColor;
    layout(set = 0, binding = 1) uniform sampler uSampler;
	layout(set = 0, binding = 2) uniform texture2D uTexture;
	void main() {
        outColor = vec4(1.0, 0.0, 0.0, 1.0);
        outColor += vec4(vUv, 0.0, 1.0);
        outColor = texture(sampler2D(uTexture, uSampler), vUv) ;
	}
`;

async function init() {
  const ctx = await createContext();
  console.log("webgpu ctx", ctx);

  const { device, swapChain } = ctx;

  let vShaderModule = ctx.shader({ vertex: vertexShaderGLSL })
  let fShaderModule = ctx.shader({ fragment: fragmentShaderGLSL })
  
  let cube = createCube();

  let vertexBuffer = ctx.vertexBuffer({ data: cube.positions });
  let uvsBuffer = ctx.vertexBuffer({ data: cube.uvs });
  let indexBuffer = ctx.indexBuffer({ data: cube.cells });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  const uniformsBindGroupLayout = device.createBindGroupLayout({
    bindings: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        type: "uniform-buffer"
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        type: "sampler"
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        type: "sampled-texture"
      }
    ]
  });
  const matrixSize = 4 * 4 * Float32Array.BYTES_PER_ELEMENT; // 4x4 matrix
  // uniformBindGroup offset must be 256-byte aligned ??
  // more info here https://github.com/gpuweb/gpuweb/issues/116
  const offset = 256;
  const uniformBufferSize = offset + matrixSize * 2;

  const uniformBuffer = ctx.uniformBuffer({
    size: uniformBufferSize
  });

  const testImage = await loadImage("assets/pex-logo-white.png");
  const testTexture = ctx.texture({ data: testImage });
  const testSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear"
  });

  console.log("uniformBuffer", uniformBuffer);
  const uniformBindGroupDescriptor = {
    layout: uniformsBindGroupLayout,
    bindings: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
          offset: 0,
          size: matrixSize
        }
      },
      {
        binding: 1,
        resource: testSampler
      },
      {
        binding: 2,
        resource: testTexture.createView()
      }
    ]
  };
  const uniformBindGroup = device.createBindGroup(uniformBindGroupDescriptor);
  
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout]
    }),
    vertexStage: {
      module: vShaderModule,
      entryPoint: "main"
    },
    fragmentStage: {
      module: fShaderModule,
      entryPoint: "main"
    },
    vertexState: {
      indexFormat: "uint32",
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
        }
      ]
    },
    colorStates: [
      {
        format: "bgra8unorm",
        alphaBlend: {
          srcFactor: "src-alpha",
          dstFactor: "one-minus-src-alpha",
          operation: "add"
        }
      }
    ],
    depthStencilState: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
      stencilFront: {},
      stencilBack: {}
    },
    primitiveTopology: "triangle-list"
  });
  let projectionMatrix = new Float32Array(16);
  let modelMatrix = new Float32Array(16);
  let aspect = Math.abs(1);
  mat4.perspective(projectionMatrix, Math.PI / 2, aspect, 0.1, 100.0);
  
  const depthTexture = ctx.texture({
    width: ctx.canvas.width,
    height: ctx.canvas.height,
    format: ctx.PixelFormat.Depth24PlusStencil18
  })

  const pass = ctx.pass({
    clearColor: [1, 1, 0, 1],
    depth: depthTexture,
    clearDepth: 1,    
  })

  function render(time) {    
    ctx.submit({
      pass: pass,
      attributes: [ // TODO: this should be called vertexBuffers
        vertexBuffer,
        uvsBuffer
      ],
      indices: indexBuffer, // TODO: this should be called indexBuffer
      pipeline: pipeline,
      uniforms: [ // TODO: this should be called uniformBindGroups
        uniformBindGroup
      ],
      count: cube.cells.length * 3
    })

    mat4.identity(modelMatrix);
    mat4.translate(modelMatrix, [0, 0, -2]);
    mat4.rotate(modelMatrix, time / 1000, [1, 0, 0]);
    mat4.rotate(modelMatrix, time / 1000, [0, 1, 0]);    

    ctx.update(uniformBuffer, { offset: 0, data: projectionMatrix })
    ctx.update(uniformBuffer, { offset: 4 * 16, data: modelMatrix })    
  }

  ctx.frame(render);
}

init()