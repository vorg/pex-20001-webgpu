const createCube = require("primitive-cube");
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
  const ctx = await createContext({ width: 600, height: 600 });
  console.log("webgpu ctx", ctx);

  let cube = createCube();

  let vertexBuffer = ctx.vertexBuffer({ data: cube.positions });
  let uvsBuffer = ctx.vertexBuffer({ data: cube.uvs });
  let indexBuffer = ctx.indexBuffer({ data: cube.cells });

  const matrixSize = 4 * 4 * Float32Array.BYTES_PER_ELEMENT; // 4x4 matrix
  const uniformBuffer = ctx.uniformBuffer({
    size: matrixSize * 2 //offset must be 256-byte aligned? More https://github.com/gpuweb/gpuweb/issues/116
  });

  const image = await loadImage("assets/pex-logo-white.png");
  const texture = ctx.texture({ data: image });

  const sampler = ctx.sampler({    
    min: ctx.Filter.Linear,
    mag: ctx.Filter.Linear,
    mipmap: true
  });

  const uniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility : ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer },
    { visibility : ctx.ShaderStage.Fragment, type: ctx.BindingType.Sampler },
    { visibility : ctx.ShaderStage.Fragment, type: ctx.BindingType.SampledTexture }
  ])

  const uniformBindGroup = ctx.bindGroup({
    layout: uniformsBindGroupLayout,
    bindings: [
      { buffer: uniformBuffer },
      sampler,
      texture
    ]
  })  
  
  const pipeline = ctx.pipeline({
    vert: vertexShaderGLSL,
    frag: fragmentShaderGLSL,
    bindGroupLayouts: [ uniformsBindGroupLayout ]
  })

  let projectionMatrix = new Float32Array(16);
  let modelMatrix = new Float32Array(16);
  mat4.perspective(projectionMatrix, Math.PI / 2, ctx.canvas.width / ctx.canvas.height, 0.1, 100.0);
  
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