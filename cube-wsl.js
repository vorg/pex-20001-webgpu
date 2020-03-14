const createCube = require("primitive-cube");
const createTorus = require("primitive-torus");
const { mat4 } = require("pex-math");
const createContext = require("./context");
const loadImage = require("./load-image");
const {
  perspective: createCamera,
  orbiter: createOrbiter
} = require("pex-cam");

const isSafari = navigator.vendor.includes("Apple")

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
    layout(location = 0) out vec2 vUv;
	  void main() {
    vUv = uv * optsUniforms.uvScale;
		gl_Position = uniforms.projectionMatrix * uniforms.viewMatrix * optsUniforms.modelMatrix * vec4(position, 1.0);
	}
`;

const fragmentShaderGLSL = `
  #version 450
  layout(location = 0) in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  layout(set = 2, binding = 0) uniform sampler uSampler;
  layout(set = 2, binding = 1) uniform texture2D uTexture;
  void main() {
    outColor = vec4(1.0, 0.0, 0.0, 1.0);
    outColor += vec4(vUv, 0.0, 1.0);
    outColor = texture(sampler2D(uTexture, uSampler), vUv) ;
	}
`;

const shaderWSL = `
struct FragmentData {
    float4 position : SV_Position;
    float2 uv : attribute(1);
}

struct Uniforms {
    float4x4 projectionMatrix;
    float4x4 viewMatrix;      
};

struct OptsUniforms {
    float4x4 modelMatrix;
    float2 uvScale;      
}

vertex FragmentData vertex_main(
    float3 position : attribute(0),
    float2 uv : attribute(1),
    constant Uniforms[] uniforms : register(b0, space0),
    constant OptsUniforms[] optsUniforms : register(b0, space1)
)
{
    FragmentData out;
    float4x4 mvp = mul(uniforms[0].projectionMatrix, mul(uniforms[0].viewMatrix, optsUniforms[0].modelMatrix));
    out.position = mul(mvp, float4(position, 1.0));
    out.uv = uv;
    return out;
}

fragment float4 fragment_main(
    float2 uv : attribute(1),
    sampler uSampler : register(s0, space2),
    Texture2D<float4> uTexture : register(t1, space2)
) : SV_Target 0
{
    // return float4(uv, 0.0, 1.0);
    return Sample(uTexture, uSampler, uv);
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
    position: [2, 0, 2]
  });

  const orbiter = createOrbiter({
    camera: camera,
    element: ctx.canvas
  });

  let cube = createCube();
  let torus = createTorus({
    minorRadius: 0.1
  });

  let vertexBuffer = ctx.vertexBuffer({ data: cube.positions });
  let uvsBuffer = ctx.vertexBuffer({ data: cube.uvs });
  let indexBuffer = ctx.indexBuffer({ data: cube.cells });

  let vertexBufferTorus = ctx.vertexBuffer({ data: torus.positions });
  let uvsBufferTorus = ctx.vertexBuffer({ data: torus.uvs });
  let indexBufferTorus = ctx.indexBuffer({ data: torus.cells });

  const mat4Size = 16 * Float32Array.BYTES_PER_ELEMENT;
  const vec2Size = 2 * Float32Array.BYTES_PER_ELEMENT;
  const uniformBuffer = ctx.uniformBuffer({
    size: mat4Size * 2 //offset must be 256-byte aligned? More https://github.com/gpuweb/gpuweb/issues/116
  });

  const optsUniformBuffer = ctx.uniformBuffer({
    size: mat4Size + vec2Size
  });

  const optsUniformBufferTorus = ctx.uniformBuffer({
    size: mat4Size + vec2Size
  });

  const image = await loadImage("assets/pex-logo-white.png");
  const texture = ctx.texture({ data: image });

  const uvImage = await loadImage("assets/uv.png");
  const uvTexture = ctx.texture({ data: uvImage });

  const sampler = ctx.sampler({
    min: ctx.Filter.Linear,
    mag: ctx.Filter.Linear,
    mipmap: true
  });

  const uniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer }
  ]);

  const optsUniformsBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Vertex, type: ctx.BindingType.UniformBuffer }
  ])

  const textureBindGroupLayout = ctx.bindGroupLayout([
    { visibility: ctx.ShaderStage.Fragment, type: ctx.BindingType.Sampler },
    {
      visibility: ctx.ShaderStage.Fragment,
      type: ctx.BindingType.SampledTexture
    }
  ]);

  const uniformBindGroup = ctx.bindGroup({
    layout: uniformsBindGroupLayout,
    bindings: [{ buffer: uniformBuffer, size: mat4Size * 2 }],    
  });

  const optsUniformBindGroup = ctx.bindGroup({
    layout: optsUniformsBindGroupLayout,
    bindings: [{ buffer: optsUniformBuffer, size: mat4Size + vec2Size }],    
  });

  const optsUniformBindGroupTorus = ctx.bindGroup({
    layout: optsUniformsBindGroupLayout,
    bindings: [{ buffer: optsUniformBufferTorus, size: mat4Size + vec2Size }]
  });

  const textureBindGroup = ctx.bindGroup({
    layout: textureBindGroupLayout,
    bindings: [sampler, texture],    
  });

  const textureBindGroupTorus = ctx.bindGroup({
    layout: textureBindGroupLayout,
    bindings: [sampler, uvTexture]
  });

  const pipeline = isSafari ? ctx.pipeline({
    shaderWSL: shaderWSL,
    bindGroupLayouts: [uniformsBindGroupLayout, optsUniformsBindGroupLayout, textureBindGroupLayout]
  }) : ctx.pipeline({
    vert: vertexShaderGLSL,
    frag: fragmentShaderGLSL,
    bindGroupLayouts: [uniformsBindGroupLayout, optsUniformsBindGroupLayout, textureBindGroupLayout]
  });

  let projectionMatrix = new Float32Array(16);
  let modelMatrix = new Float32Array(16);
  let modelMatrixTorus = new Float32Array(16);
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
    format: isSafari ? ctx.PixelFormat.Depth32FloatStencil18 : ctx.PixelFormat.Depth24PlusStencil18
  });

  const pass = ctx.pass({
    clearColor: [1, 0, 0, 1],
    depth: depthTexture,
    clearDepth: 1
  });

  const drawCubeCmd = {
    attributes: [
      // TODO: this should be called vertexBuffers
      vertexBuffer,
      uvsBuffer
    ],
    indices: indexBuffer, // TODO: this should be called indexBuffer
    uniforms: [
      // TODO: this should be called bindGroups
      uniformBindGroup,      
      optsUniformBindGroup,
      textureBindGroup
    ],
    count: cube.cells.length * 3
  };

  const drawTorusCmd = {
    attributes: [
      // TODO: this should be called vertexBuffers
      vertexBufferTorus,      
      uvsBufferTorus,
      textureBindGroupTorus
    ],
    indices: indexBufferTorus, // TODO: this should be called indexBuffer
    uniforms: [
      // TODO: this should be called bindGroups
      uniformBindGroup,
      optsUniformBindGroupTorus
    ],
    count: torus.cells.length * 3
  };

  const renderPassCmd = {
    pass: pass,
    pipeline: pipeline
  };

  /*---------------------------------------------*/

  const uboPool = {
    queue: []
  }
  
  /*---------------------------------------------*/

  let once = false
  async function render(time) {
    if (uboPool.queue.length == 0) {
      // var buffer = uniformBufferMapped
      // get new from cache or use old one
    }
    

    ctx.submit(renderPassCmd, () => {
      ctx.submit(drawCubeCmd);
    //  //ctx.submit(drawTorusCmd);
    });

    // if (once) return
    // once = true

    // var uniformArrayBuffer = await uniformBuffer.mapWriteAsync()
    // var uniformWriteArray = new Float32Array(uniformArrayBuffer)
    // uniformWriteArray.set(new Float32Array(
    //   [...camera.projectionMatrix, ...camera.viewMatrix]
    // ))
    // uniformBuffer.unmap();

    // console.log('uniformBuffer', uniformBuffer.mapWriteAsync)

    ctx.update(uniformBuffer, {
      offset: 0,
      data: new Float32Array(camera.projectionMatrix)
    }); //TODO: GC
    ctx.update(uniformBuffer, {
      offset: mat4Size,
      data: new Float32Array(camera.viewMatrix)
    }); //TODO: GC

    mat4.identity(modelMatrix);
    mat4.translate(modelMatrix, [0, 0, 0]);
    mat4.rotate(modelMatrix, time / 1000, [0, 1, 0]);

    mat4.identity(modelMatrixTorus);
    mat4.translate(modelMatrixTorus, [0, 0, 0]);
    mat4.rotate(modelMatrixTorus, time / 1000, [0, 1, 0]);
    mat4.rotate(modelMatrixTorus, Math.PI / 2, [1, 0, 0]);

    // // TODO: uniform updates should be batched somehow
    ctx.update(optsUniformBuffer, { offset: 0, data: modelMatrix });
    ctx.update(optsUniformBuffer, {
      offset: mat4Size,
      data: new Float32Array([1, 1])
    }); //TODO: GC

    // var uniformArrayBuffer = await optsUniformBuffer.mapWriteAsync()
    // var uniformWriteArray = new Float32Array(uniformArrayBuffer)
    // uniformWriteArray.set(new Float32Array(
    //   [...modelMatrix, 1, 1]
    // ))
    // optsUniformBuffer.unmap();

    ctx.update(optsUniformBufferTorus, { offset: 0, data: modelMatrixTorus });
    ctx.update(optsUniformBufferTorus, {
      offset: mat4Size,
      data: new Float32Array([4, 1])
    }); //TODO: GC
  }

  ctx.frame(render);
}

init();
