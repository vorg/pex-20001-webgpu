// MIT licensed. 

function fabsf (arg) {
  return arg >= 0 ? arg : -arg
}
function planeBoxOverlap (normal, vert, maxbox) {
  var q
  var vmin = []
  var vmax = []
  var v
  for (q = 0; q <= 2; q++) {
    v = vert[q]
    if (normal[q] > 0.0) {
      vmin[q] = -maxbox[q] - v
      vmax[q] = maxbox[q] - v
    } else {
      vmin[q] = maxbox[q] - v
      vmax[q] = -maxbox[q] - v
    }
  }
  if ((normal[0] * vmin[0] + normal[1] * vmin[1] + normal[2] * vmin[2]) > 0.0) {
    return false
  }
  if ((normal[0] * vmax[0] + normal[1] * vmax[1] + normal[2] * vmax[2]) >= 0.0) {
    return true
  }

  return false
}

module.exports =  function(boxcenter, boxhalfsize, triverts) {
  var v0 = []
  var v1 = []
  var v2 = []

  var min, max, p0, p1, p2, rad, fex, fey, fez
  var normal = []
  var e0 = []
  var e1 = []
  var e2 = []

  v0[0] = triverts[0][0] - boxcenter[0]
  v0[1] = triverts[0][1] - boxcenter[1]
  v0[2] = triverts[0][2] - boxcenter[2]

  v1[0] = triverts[1][0] - boxcenter[0]
  v1[1] = triverts[1][1] - boxcenter[1]
  v1[2] = triverts[1][2] - boxcenter[2]

  v2[0] = triverts[2][0] - boxcenter[0]
  v2[1] = triverts[2][1] - boxcenter[1]
  v2[2] = triverts[2][2] - boxcenter[2]

  e0[0] = v1[0] - v0[0]
  e0[1] = v1[1] - v0[1]
  e0[2] = v1[2] - v0[2]

  e1[0] = v2[0] - v1[0]
  e1[1] = v2[1] - v1[1]
  e1[2] = v2[2] - v1[2]

  e2[0] = v0[0] - v2[0]
  e2[1] = v0[1] - v2[1]
  e2[2] = v0[2] - v2[2]

  fex = fabsf(e0[0])
  fey = fabsf(e0[1])
  fez = fabsf(e0[2])

  p0 = e0[2] * v0[1] - e0[1] * v0[2]
  p2 = e0[2] * v2[1] - e0[1] * v2[2]

  if (p0 < p2) {
    min = p0
    max = p2
  } else {
    min = p2
    max = p0
  } rad = fez * boxhalfsize[1] + fey * boxhalfsize[2]
  if (min > rad || max < -rad) {
    return false
  }

  p0 = -e0[2] * v0[0] + e0[0] * v0[2]
  p2 = -e0[2] * v2[0] + e0[0] * v2[2]
  if (p0 < p2) {
    min = p0
    max = p2
  } else {
    min = p2
    max = p0
  } rad = fez * boxhalfsize[0] + fex * boxhalfsize[2]
  if (min > rad || max < -rad) {
    return false
  }

  p1 = e0[1] * v1[0] - e0[0] * v1[1]
  p2 = e0[1] * v2[0] - e0[0] * v2[1]
  if (p2 < p1) {
    min = p2
    max = p1
  } else {
    min = p1
    max = p2
  } rad = fey * boxhalfsize[0] + fex * boxhalfsize[1]
  if (min > rad || max < -rad) {
    return false
  }

  fex = fabsf(e1[0])
  fey = fabsf(e1[1])
  fez = fabsf(e1[2])

  p0 = e1[2] * v0[1] - e1[1] * v0[2]
  p2 = e1[2] * v2[1] - e1[1] * v2[2]
  if (p0 < p2) {
    min = p0
    max = p2
  } else {
    min = p2
    max = p0
  } rad = fez * boxhalfsize[1] + fey * boxhalfsize[2]
  if (min > rad || max < -rad) {
    return false
  }

  p0 = -e1[2] * v0[0] + e1[0] * v0[2]
  p2 = -e1[2] * v2[0] + e1[0] * v2[2]
  if (p0 < p2) {
    min = p0
    max = p2
  } else {
    min = p2
    max = p0
  } rad = fez * boxhalfsize[0] + fex * boxhalfsize[2]
  if (min > rad || max < -rad) {
    return false
  }

  p0 = e1[1] * v0[0] - e1[0] * v0[1]
  p1 = e1[1] * v1[0] - e1[0] * v1[1]
  if (p0 < p1) {
    min = p0
    max = p1
  } else {
    min = p1
    max = p0
  } rad = fey * boxhalfsize[0] + fex * boxhalfsize[1]
  if (min > rad || max < -rad) {
    return false
  }

  fex = fabsf(e2[0])
  fey = fabsf(e2[1])
  fez = fabsf(e2[2])

  p0 = e2[2] * v0[1] - e2[1] * v0[2]
  p1 = e2[2] * v1[1] - e2[1] * v1[2]
  if (p0 < p1) {
    min = p0
    max = p1
  } else {
    min = p1
    max = p0
  } rad = fez * boxhalfsize[1] + fey * boxhalfsize[2]
  if (min > rad || max < -rad) {
    return false
  }

  p0 = -e2[2] * v0[0] + e2[0] * v0[2]
  p1 = -e2[2] * v1[0] + e2[0] * v1[2]
  if (p0 < p1) {
    min = p0
    max = p1
  } else {
    min = p1
    max = p0
  } rad = fez * boxhalfsize[0] + fex * boxhalfsize[2]
  if (min > rad || max < -rad) {
    return false
  }

  p1 = e2[1] * v1[0] - e2[0] * v1[1]
  p2 = e2[1] * v2[0] - e2[0] * v2[1]
  if (p2 < p1) {
    min = p2
    max = p1
  } else {
    min = p1
    max = p2
  } rad = fey * boxhalfsize[0] + fex * boxhalfsize[1]
  if (min > rad || max < -rad) {
    return false
  }

  min = max = v0[0]
  if (v1[0] < min) {
    min = v1[0]
  }
  if (v1[0] > max) {
    max = v1[0]
  }
  if (v2[0] < min) {
    min = v2[0]
  }
  if (v2[0] > max) {
    max = v2[0]
  }

  if (min > boxhalfsize[0] || max < -boxhalfsize[0]) {
    return false
  }

  min = max = v0[1]
  if (v1[1] < min) {
    min = v1[1]
  }
  if (v1[1] > max) {
    max = v1[1]
  }
  if (v2[1] < min) {
    min = v2[1]
  }
  if (v2[1] > max) {
    max = v2[1]
  }

  if (min > boxhalfsize[1] || max < -boxhalfsize[1]) {
    return false
  }

  min = max = v0[2]
  if (v1[2] < min) {
    min = v1[2]
  }
  if (v1[2] > max) {
    max = v1[2]
  }
  if (v2[2] < min) {
    min = v2[2]
  }
  if (v2[2] > max) {
    max = v2[2]
  }

  if (min > boxhalfsize[2] || max < -boxhalfsize[2]) {
    return false
  }

  normal[0] = e0[1] * e1[2] - e0[2] * e1[1]
  normal[1] = e0[2] * e1[0] - e0[0] * e1[2]
  normal[2] = e0[0] * e1[1] - e0[1] * e1[0]

  if (!planeBoxOverlap(normal, v0, boxhalfsize)) {
    return false
  }

  return true
}