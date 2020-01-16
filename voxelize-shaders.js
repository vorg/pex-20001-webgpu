// TODO: remove those
const gridSize = 1
const gridResolution = 64
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


const voxelizeSurfaceBlurComputeGLSL = `#version 450
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
  int N = int(params.gridResolution);
  int index = resultCell.x + resultCell.z * N + resultCell.y * N * N;
  vec4 result = vec4(0.0);
  int count = 1;
  int r = 3;
  // for (int x = max(0, resultCell.x - r); x < min(resultCell.x + r, N); x++) {
  //   for (int y = max(0, resultCell.y - r); x < min(resultCell.y + r, N); y++) {
  //     for (int z = max(0, resultCell.z - r); x < min(resultCell.z + r, N); z++) {
  //       int index = x + z * N + y * N * N;
  //       result += voxelColorData.colors[index];
  //       count += 1;
  //     }
  //   }
  // }  
  
  voxelColorData.colors[index] = result / float(count);
}
`;

module.exports = {
  vertexShaderGLSL,
  fragmentShaderGLSL,
  vertexShaderMeshGLSL,
  computeShaderGLSL,
  voxelizeSurfaceFrontComputeGLSL,
  voxelizeSurfaceBlurComputeGLSL
}