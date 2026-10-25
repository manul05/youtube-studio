'use strict';

/** Stream checks for a finished video against what the plan expects. */
function streamIssues(meta, expected) {
  const issues = [];
  const v = meta.streams.find((s) => s.codec_type === 'video');
  const a = meta.streams.find((s) => s.codec_type === 'audio');
  if (!v || !a) return ['The file needs both a video and an audio stream.'];
  const checks = {
    [`size ${expected.width}×${expected.height}`]:
      v.width === expected.width && v.height === expected.height,
    [`${expected.fps} fps`]: v.r_frame_rate === `${expected.fps}/1`,
    [`${expected.frames} frames`]:
      expected.frames === undefined || Number(v.nb_frames) === expected.frames,
    [`duration ${expected.duration.toFixed(2)} s`]:
      Math.abs(Number(meta.format.duration) - expected.duration) < 0.1,
    'H.264 video': v.codec_name === 'h264',
    'yuv420p pixels': v.pix_fmt === 'yuv420p',
    'BT.709 colour tags':
      v.color_primaries === 'bt709' && v.color_transfer === 'bt709' && v.color_space === 'bt709',
    'AAC audio': a.codec_name === 'aac',
    '48 kHz stereo audio': Number(a.sample_rate) === 48000 && a.channels === 2,
  };
  for (const [name, ok] of Object.entries(checks))
    if (!ok) issues.push(`Media check failed: ${name}.`);
  return issues;
}

module.exports = { streamIssues };
