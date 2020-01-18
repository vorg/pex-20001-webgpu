// TODO: remove those
const gridSize = 1
const gridResolution = 100
const numVoxels = gridResolution * gridResolution * gridResolution

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
    vec3 pos = position * 0.9;
    pos *= voxel + 0.0;
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
		gl_Position = uniforms.projectionMatrix * uniforms.viewMatrix * optsUniforms.modelMatrix * vec4(pos, 1.0);
	}
`;

const fragmentShaderGLSL = `
  #version 450
  layout(location = 0) in vec2 vUv;
  layout(location = 1) in vec4 vColor;
  layout(set = 1, binding = 1) uniform sampler uSampler;
  layout(set = 1, binding = 2) uniform texture2D uTexture;
  layout(location = 0) out vec4 outColor;
  void main() {
    outColor = vec4(vUv, 0.0, 1.0);    
    outColor = vColor;
    // outColor.rg *= vColor.r;
    vec2 uv = vec2(1.0 - clamp(vColor.r, 0.0, 1.0), 0.5);
    outColor = texture(sampler2D(uTexture, uSampler), uv);
    // outColor = outColor / (1.0 + outColor);
    // outColor = vec4(uv.x, 1.0, 0.0, 1.0);
   
    // outColor = texture(sampler2D(uTexture, uSampler), vUv) ;
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

const fragmentShaderMeshGLSL = `
  #version 450
  layout(location = 0) in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  void main() {
    outColor = vec4(vUv, 0.0, 1.0);    
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
    
    vec4 outColor = vec4(max(0.0, 1.0 - count / 30.0), 0.0, 0.0, 1.0);
    if (count == 0) outColor = vec4(0.0, 0.0, 0.0, 1.0);
    voxelColorData.colors[index] = outColor;
  }
`;


const voxelizeSurfaceBlurComputeGLSL = `#version 450
layout(std140, set = 0, binding = 0) uniform Params {
    float gridSize;
    float gridResolution;
} params;

layout(std430, set = 0, binding = 1) buffer VoxelData {
  float voxels[${numVoxels}];
} voxelData;

layout(std430, set = 0, binding = 2) buffer InVoxelColorData {
  vec4 colors[${numVoxels}];
} inVoxelColorData;

layout(std430, set = 0, binding = 3) buffer VoxelColorData {
  vec4 colors[${numVoxels}];
} voxelColorData;

layout(local_size_x = 4, local_size_y = 4, local_size_z = 1) in;

void main() {
  ivec3 resultCell = ivec3(gl_GlobalInvocationID.x, gl_GlobalInvocationID.y, gl_GlobalInvocationID.z);
  int N = int(params.gridResolution);
  int index = resultCell.x + resultCell.z * N + resultCell.y * N * N;
  vec4 result = vec4(0.0);
  int count = 1;
  int r = 3;
  // int x =  resultCell.x;
  int y =  resultCell.y;
  int z =  resultCell.z;
    
  for (int x = max(0, resultCell.x - 1); x < min(resultCell.x + 1, N - 1); x++) {
    for (int y = max(0, resultCell.y - 1); y < min(resultCell.y + 1, N - 1); y++) {
      for (int z = max(0, resultCell.z - 1); z < min(resultCell.z + 1, N - 1); z++) {
        int ind = x + z * N + y * N * N;
        result += inVoxelColorData.colors[ind];
        result = max(result, inVoxelColorData.colors[ind]);
        count += 1;
      }
    }
  }  
  
  // voxelColorData.colors[index] = result / float(count);
  voxelColorData.colors[index] = result;
  // voxelColorData.colors[index] = inVoxelColorData.colors[index];
  if (count == 1) {
    // voxelColorData.colors[index] = vec4(0.0, 1.0, 0.0, 1.0);
  }
}
`;

module.exports = {
  vertexShaderGLSL,
  fragmentShaderGLSL,
  vertexShaderMeshGLSL,
  fragmentShaderMeshGLSL,
  computeShaderGLSL,
  voxelizeSurfaceFrontComputeGLSL,
  voxelizeSurfaceBlurComputeGLSL
}