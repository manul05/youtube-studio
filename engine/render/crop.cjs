'use strict';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * A crop rectangle (image pixels) with the given aspect ratio that covers `region`
 * ([x, y, w, h] as fractions of the image), centred on it and kept inside the image.
 */
function cropFor(img, region, aspect) {
  const [fx, fy, fw, fh] = region;
  let w = Math.max(fw * img.width, fh * img.height * aspect);
  let h = w / aspect;
  if (w > img.width) {
    w = img.width;
    h = w / aspect;
  }
  if (h > img.height) {
    h = img.height;
    w = h * aspect;
  }
  const cx = (fx + fw / 2) * img.width;
  const cy = (fy + fh / 2) * img.height;
  return { x: clamp(cx - w / 2, 0, img.width - w), y: clamp(cy - h / 2, 0, img.height - h), w, h };
}

module.exports = { cropFor };
