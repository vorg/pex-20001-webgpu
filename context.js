// Written agains Chrome Canary Version 81.0.4014.0 

function Context({ gpu, adapter, device, glslangimpl }) {
  this.gpu = gpu;
  this.adapter = adapter;
  this.device = device;
  this.glslangimpl = glslangimpl;
  this.disposed = false;

  this.canvas = document.createElement("canvas");
  this.canvas.width = 600;
  this.canvas.height = 600;
  document.body.appendChild(this.canvas);

  this.webgpuContext = this.canvas.getContext("gpupresent");

  const swapChainFormat = "bgra8unorm";

  const swapChainDescriptor = {
    device: device,
    format: swapChainFormat
  };
  this.swapChain = this.webgpuContext.configureSwapChain(swapChainDescriptor);

  this.PixelFormat = {
    Depth24PlusStencil18: "depth24plus-stencil8"
  };
}

Context.prototype.frame = function(cb) {
  const self = this;
  requestAnimationFrame(function frame(time) {
    self.defaultCommandEncoder = self.device.createCommandEncoder();
    if (self.disposed || cb(time) === false) {
      // interrupt render loop
      return;
    }
    self.device.defaultQueue.submit([
      self.defaultCommandEncoder.finish()
    ]);
    requestAnimationFrame(frame);
  });
};

Context.prototype.submit = function (opts) {
  const commandEncoder = this.defaultCommandEncoder
  // TODO: default screen texture injection
  if (!opts.pass.color) {
    const textureView = this.swapChain.getCurrentTexture().createView();
    opts.pass.colorAttachments[0].attachment = textureView
  }
  const passEncoder = commandEncoder.beginRenderPass(opts.pass);
  for (var i = 0; i < opts.attributes.length; i++) {
    passEncoder.setVertexBuffer(i, opts.attributes[i])
  }
  if (opts.indices) {
    passEncoder.setIndexBuffer(opts.indices);
  }
  for (var i = 0; i < opts.uniforms.length; i++) {
    passEncoder.setBindGroup(i, opts.uniforms[i])
  }
  passEncoder.setPipeline(opts.pipeline);

  passEncoder.drawIndexed(opts.count, opts.instances || 1, 0, 0, 0);
  passEncoder.endPass();    
}

Context.prototype.dispose = function() {
  this.disposed = true;
  this.canvas.parentElement.removeChild(this.canvas);
};

// assumes opts data is decoded HTMLImage
Context.prototype.texture = function(opts) {
  if (opts.data instanceof HTMLImageElement) {
    return createTextureFromImage(
      this.device,
      opts.data,
      GPUTextureUsage.SAMPLED
    );
  } else {
    return this.device.createTexture({
      size: { width: opts.width, height: opts.height, depth: 1 },
      arrayLayerCount: 1,
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: "2d",
      format: opts.format,
      usage: GPUTextureUsage.OUTPUT_ATTACHMENT // TODO: this should be in opts
    });
  }
};

Context.prototype.vertexBuffer = function(opts) {
  let { data } = opts;

  if (Array.isArray(data)) {
    data = new Float32Array(data.flat());
  }

  let bufferDescriptor = {
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  };
  let vertexBuffer = this.device.createBuffer(bufferDescriptor);
  vertexBuffer.setSubData(0, data);

  return vertexBuffer;
};

Context.prototype.indexBuffer = function(opts) {
  let { data } = opts;

  if (Array.isArray(data)) {
    data = new Uint32Array(data.flat());
  }

  let bufferDescriptor = {
    size: data.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  };
  let indexBuffer = this.device.createBuffer(bufferDescriptor);
  indexBuffer.setSubData(0, data);

  return indexBuffer;
};

Context.prototype.uniformBuffer = function(opts) {
  let { size } = opts;

  let bufferDescriptor = {
    size: size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  };
  let uniformBuffer = this.device.createBuffer(bufferDescriptor);
  uniformBuffer._update = function (opts) {
    // TODO: this is deprecated in newest API
    uniformBuffer.setSubData(opts.offset, opts.data)    
  }

  return uniformBuffer;
};

Context.prototype.update = function (resource, opts) {
  if (resource._update) {
    resource._update(opts)
  } else {
    console.error(resource, `does not implement _update()`)
    throw new Error(`${resource} does not implement _update()`)
  }
}

Context.prototype.shader = function(opts) {
  let type = "";
  let src = "";
  if (opts.vertex) {
    type = "vertex";
    src = opts.vertex;
  }
  if (opts.fragment) {
    type = "fragment";
    src = opts.fragment;
  }

  // TODO: this seem to be old format as new require 'module' prop
  let shaderModuleDescriptor = {
    code: this.glslangimpl.compileGLSL(src, type)
    // source: src // not needed
  };
  let shaderModule = this.device.createShaderModule(shaderModuleDescriptor);
  return shaderModule;
};

Context.prototype.pass = function (opts) {
  const clearColor = opts.clearColor || [1, 1, 1, 1]
  const renderPassDescriptor = {
    colorAttachments: [
      {
        loadValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] }
      }
    ],
    depthStencilAttachment: {
      attachment: opts.depth.createView(),
      depthLoadOp: "clear",
      depthStoreOp: "store",
      stencilLoadOp: "clear",
      stencilStoreOp: "store",
      depthLoadValue: 1.0,
      stencilLoadValue: 1.0
    }
  };

  return renderPassDescriptor
}

function createTextureFromImage(device, img, usage) {
  // const img = document.createElement('img');
  // img.src = src;
  // await img.decode();

  let mipMaps = Math.log2(Math.max(img.width, img.height));
  mipMaps = Math.floor(mipMaps);

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
    // document.body.appendChild(imageCanvas)
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
  let i = 1;
  let len = mipMaps;
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

async function createContext() {
  const gpu = navigator.gpu;
  const adapter = await gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslangimpl = await glslang(); //required via script tag

  return new Context({ gpu, adapter, device, glslangimpl });
}

module.exports = createContext;
