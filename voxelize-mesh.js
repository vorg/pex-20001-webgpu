let N = 64 // voxel grid res.
let s = 60 // half side length of voxel grid.
let vs = (2*s) / N // side length of a single voxel
const aabbTriCollision = require('./aabb-tri.js')

// snap coordinate to voxel grid coordinates.
function snap(p) {
  return Math.floor(p / vs) + N/2
}

function voxelizeMesh(cells, positions, size, resolution) {  
  N = resolution  
  s = size
  vs = (2 * s) / N

  const voxelData = new Float32Array(N * N * N)

  // voxelize faces, one after one.
  for(var ic = 0; ic < cells.length; ic++) {

    var cell = cells[ic]

    // triangle vertices.
    var ps = [positions[cell[0]], positions[cell[1]], positions[cell[2]]]

    var p = ps[0]

    var min = [p[0], p[1], p[2]]
    var max = [p[0], p[1], p[2]]

    // find AABB that covers entire triangle.
    for(var ip = 1; ip < 3; ip++) {
      var pos = ps[ip]

      for(var i = 0; i < 3; i++) {

        if(pos[i] > max[i]) {
          max[i] = pos[i]
        }

        if(pos[i] < min[i]) {
          min[i] = pos[i]
        }

      }
    }

    // snap AABB to voxel grid coordinates.
    min = [snap(min[0]), snap(min[1]), snap(min[2])]
    max = [snap(max[0]), snap(max[1]), snap(max[2])]

    // now we need to check all the voxels in that AABB.
    // the voxels that intersect the triangle will be added.
    for(var ix = min[0]; ix <= max[0]; ix++) {
      for(var iy = min[1]; iy <= max[1]; iy++) {
        for(var iz = min[2]; iz <= max[2]; iz++) {


          // voxel center.
          var bc = [((ix - N/2) + 0.5) * vs, ((iy - N/2) + 0.5) * vs, ((iz - N/2) + 0.5) * vs]

          // voxel box hald sides.
          var bhs = [vs*0.5, vs*0.5, vs*0.5]
          // triangle vertices.
          var tv = ps
          // console.log("test: ", aabbTriCollision(bc, bhs, tv))


          // fast intersection test between triangle and aabb.
          // based on this case:
          // http://fileadmin.cs.lth.se/cs/personal/tomas_akenine-moller/code/tribox3.txt
          // if collision, add voxel.
          if(aabbTriCollision(bc, bhs, tv)) {
            //voxelData[(iz * N * N + iy * N + ix) * 4] = 255.0
            voxelData[iy * N * N + iz * N + ix] = 1
          }
        }
      }
    }
    const result = {
      voxels: voxelData
    }
    result.voxels.shape = [N, N, N]
    result.voxels.get = function (ix, iy, iz) {
      return voxelData[iz * N * N + iy * N + ix]
    }
    return result
  }
}

module.exports = voxelizeMesh