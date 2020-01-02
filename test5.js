//const { mat4, vec3 } = require('pex-math')
const createCube = require("primitive-cube");
const createSphere = require("primitive-sphere");
const createTorus = require("primitive-torus");
const { mat4 } = require("pex-math");

const ready = glslang();
ready.then(init);

const vertexShaderGLSL = `
	#version 450
    layout(set=0,binding = 0) uniform Uniforms {
        mat4 projectionMatrix;
        mat4 modelMatrix;
    } uniforms;
    layout(location = 0) in vec4 position;
    layout(location = 1) in vec2 uv;
    layout(location = 0) out vec2 vUv;
	void main() {
        vUv = uv;
		gl_Position = uniforms.projectionMatrix * uniforms.modelMatrix * position;
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

async function createTextureFromImage(device, src, usage) {
  const img = document.createElement("img");
  img.src = src;
  await img.decode();

  let mipMaps = Math.log2(Math.max(img.width, img.height));
  mipMaps = Math.floor(mipMaps);
  console.log("mipMaps", mipMaps);

  const textureExtent = {
    width: img.width,
    height: img.height,
    depth: 1
  };

  const textureDescriptor = {
    dimension: "2d",
    format: "rgba8unorm",
    arrayLayerCount: 1,
    mipLevelCount: mipMaps + 1,
    sampleCount: 1,
    size: textureExtent,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.SAMPLED
  };

  const texture = device.createTexture(textureDescriptor);

  function updateTexture(mip, width, height, face = -1) {
    const imageCanvas = document.createElement("canvas");
    document.body.appendChild(imageCanvas);
    imageCanvas.width = width;
    imageCanvas.height = height;
    const imageCanvasContext = imageCanvas.getContext("2d");
    imageCanvasContext.translate(0, height);
    imageCanvasContext.scale(1, -1);
    imageCanvasContext.drawImage(img, 0, 0, width, height);
    const imageData = imageCanvasContext.getImageData(0, 0, width, height);
    console.log("imageData", imageData);
    let data = null;
    const rowPitch = Math.ceil((width * 4) / 256) * 256;
    if (rowPitch == width * 4) {
      data = imageData.data;
      console.log("여기냐", width, data);
    } else {
      // data = new Uint8Array(rowPitch * img.height);
      // for (let y = 0; y < img.height; ++y) {
      // 	for (let x = 0; x < img.width; ++x) {
      // 		let i = x * 4 + y * rowPitch;
      // 		data[i] = imageData.data[i];
      // 		data[i + 1] = imageData.data[i + 1];
      // 		data[i + 2] = imageData.data[i + 2];
      // 		data[i + 3] = imageData.data[i + 3];
      // 	}
      // }
      data = new Uint8Array(rowPitch * height);
      let pixelsIndex = 0;
      for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
          let i = x * 4 + y * rowPitch;
          data[i] = imageData.data[pixelsIndex];
          data[i + 1] = imageData.data[pixelsIndex + 1];
          data[i + 2] = imageData.data[pixelsIndex + 2];
          data[i + 3] = imageData.data[pixelsIndex + 3];
          pixelsIndex += 4;
        }
      }
      console.log("  2", width, data);
    }

    console.log(
      "GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC",
      GPUBufferUsage.COPY_DST,
      GPUBufferUsage.COPY_SRC
    );
    const textureDataBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });

    textureDataBuffer.setSubData(0, data);
    const bufferView = {
      buffer: textureDataBuffer,
      rowPitch: rowPitch,
      imageHeight: height
    };
    const textureView = {
      texture: texture,
      mipLevel: mip,
      arrayLayer: Math.max(face, 0)
    };

    const textureExtent = {
      width,
      height,
      depth: 1
    };
    const commandEncoder = device.createCommandEncoder({});
    commandEncoder.copyBufferToTexture(bufferView, textureView, textureExtent);
    device.defaultQueue.submit([commandEncoder.finish()]);
    textureDataBuffer.destroy();
    console.log("mip", mip, "width", width, "height", height);
  }
  let i = 1,
    len = mipMaps;
  let faceWidth = img.width;
  let faceHeight = img.height;
  updateTexture(0, faceHeight, faceHeight);
  for (i; i <= len; i++) {
    faceWidth = Math.max(Math.floor(faceWidth / 2), 1);
    faceHeight = Math.max(Math.floor(faceHeight / 2), 1);
    updateTexture(i, faceHeight, faceHeight);
  }

  texture.mipmaps = mipMaps + 1;

  return texture;
}

async function init(glslang) {
  console.log("glslang", glslang);

  const gpu = navigator.gpu;
  const adapter = await gpu.requestAdapter();
  const device = await adapter.requestDevice();

  console.log("gpu", gpu);
  console.log("adapter", adapter);
  console.log("device", device);

  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 600;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("gpupresent");

  const swapChainFormat = "bgra8unorm";
  const swapChain = configureSwapChain(device, swapChainFormat, ctx);

  console.log("ctx", ctx);
  console.log("swapChain", swapChain);

  let vShaderModule = makeShaderModule_GLSL(
    glslang,
    device,
    "vertex",
    vertexShaderGLSL
  );
  let fShaderModule = makeShaderModule_GLSL(
    glslang,
    device,
    "fragment",
    fragmentShaderGLSL
  );

  let cube = createCube();
  var g = {
    positions: [],
    uvs: []
  };

  cube.cells.forEach(cell => {
    for (var i = 0; i < cell.length; i++) {
      g.positions.push([...cube.positions[cell[i]], 1]);
      g.uvs.push(cube.uvs[cell[i]]);
    }
  });

  let vertexBuffer = makeVertexBuffer(
    device,
    new Float32Array(g.positions.flat())
  );

  let uvsBuffer = makeVertexBuffer(device, new Float32Array(g.uvs.flat()));

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

  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const testTexture = await createTextureFromImage(
    device,
    "assets/pex-logo-white.png",
    GPUTextureUsage.SAMPLED
  );
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
  console.log("uniformBindGroupDescriptor", uniformBindGroupDescriptor);
  const uniformBindGroup = device.createBindGroup(uniformBindGroupDescriptor);
  console.log("uniformBindGroup", uniformBindGroup);
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
          arrayStride: 4 * 4,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: "float4"
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
        format: swapChainFormat,
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

  const depthTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height, depth: 1 },
    arrayLayerCount: 1,
    mipLevelCount: 1,
    sampleCount: 1,
    dimension: "2d",
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.OUTPUT_ATTACHMENT
  });

  let render = async function(time) {
    const renderData = {
      pipeline: pipeline,
      vertexBuffer: vertexBuffer,
      uvsBuffer: uvsBuffer,
      uniformBindGroup: uniformBindGroup,
      uniformBuffer: uniformBuffer
    };

    const commandEncoder = device.createCommandEncoder();
    const textureView = swapChain.getCurrentTexture().createView();
    // console.log(swapChain.getCurrentTexture())
    const renderPassDescriptor = {
      colorAttachments: [
        {
          attachment: textureView,
          loadValue: { r: 1, g: 1, b: 0.0, a: 1.0 }
        }
      ],
      depthStencilAttachment: {
        attachment: depthTexture.createView(),

        depthLoadOp: "clear",
        depthStoreOp: "store",
        stencilLoadOp: "clear",
        stencilStoreOp: "store",
        depthLoadValue: 1.0,
        stencilLoadValue: 1.0
      }
    };
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setVertexBuffer(0, renderData["vertexBuffer"]);
    passEncoder.setVertexBuffer(1, renderData["uvsBuffer"]);
    passEncoder.setPipeline(renderData["pipeline"]);

    mat4.identity(modelMatrix);
    mat4.translate(modelMatrix, [0, 0, -2]);
    mat4.rotate(modelMatrix, time / 1000, [1, 0, 0]);
    mat4.rotate(modelMatrix, time / 1000, [0, 1, 0]);
    passEncoder.setBindGroup(0, renderData["uniformBindGroup"]);
    renderData["uniformBuffer"].setSubData(0, projectionMatrix);
    renderData["uniformBuffer"].setSubData(4 * 16, modelMatrix);

    passEncoder.draw(g.positions.length, 1, 0, 0);
    passEncoder.endPass();
    const test = commandEncoder.finish();
    device.defaultQueue.submit([test]);
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
}

function configureSwapChain(device, swapChainFormat, context) {
  const swapChainDescriptor = {
    device: device,
    format: swapChainFormat
  };
  console.log("swapChainDescriptor", swapChainDescriptor);
  return context.configureSwapChain(swapChainDescriptor);
}

function makeShaderModule_GLSL(glslang, device, type, source) {
  console.log(
    `// makeShaderModule_GLSL start : ${type}/////////////////////////////////////////////////////////////`
  );
  let shaderModuleDescriptor = {
    code: glslang.compileGLSL(source, type),
    source: source
  };
  console.log("shaderModuleDescriptor", shaderModuleDescriptor);
  let shaderModule = device.createShaderModule(shaderModuleDescriptor);
  console.log(`shaderModule_${type}}`, shaderModule);
  console.log(
    `// makeShaderModule_GLSL end : ${type}/////////////////////////////////////////////////////////////`
  );
  return shaderModule;
}

function makeVertexBuffer(device, data) {
  let bufferDescriptor = {
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  };
  let verticesBuffer = device.createBuffer(bufferDescriptor);

  verticesBuffer.setSubData(0, data);

  return verticesBuffer;
}
