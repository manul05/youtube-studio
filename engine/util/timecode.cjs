'use strict';

/**
 * Format seconds as HH:MM:SS<sep>mmm. SRT uses ',' as the separator; VTT and logs use '.'.
 * Rounds to the nearest millisecond (with a tiny epsilon so 3661.2345 → .235).
 */
function stamp(seconds, sep = '.') {
  let ms = Math.max(0, Math.round(seconds * 1000 + 1e-6));
  const hours = Math.floor(ms / 3_600_000);
  ms %= 3_600_000;
  const minutes = Math.floor(ms / 60_000);
  ms %= 60_000;
  const secs = Math.floor(ms / 1000);
  ms %= 1000;
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${sep}${pad(ms, 3)}`;
}

module.exports = { stamp };
