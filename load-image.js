async function loadImage (src) {
  const img = document.createElement('img');
  img.src = src;

  // resolves when the image is decoded and it is safe to append the image to the DOM
  // https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode
  await img.decode();
  return img
}

module.exports = loadImage