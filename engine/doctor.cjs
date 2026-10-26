'use strict';

const { spawnSync } = require('node:child_process');
const { ENV_KEYS, loadEnv, models, saveModels } = require('./config.cjs');
const { ffmpegPath, ffprobePath, pythonPath } = require('./util/proc.cjs');
const { registerFonts } = require('./util/fonts.cjs');

const SIGN_UP = {
  GEMINI_API_KEY: 'https://aistudio.google.com/apikey',
  PEXELS_API_KEY: 'https://www.pexels.com/api/',
  PIXABAY_API_KEY: 'https://pixabay.com/api/docs/',
};

function check(name, ok, detail) {
  return { name, ok: Boolean(ok), detail };
}

function versionOf(exe, args) {
  const r = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || r.stderr).split(/\r?\n/)[0].trim();
}

function localChecks() {
  const checks = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push(check('node', major >= 22, `Node ${process.versions.node} (need >= 22)`));
  const ff = versionOf(ffmpegPath(), ['-version']);
  checks.push(check('ffmpeg', ff, ff || 'ffmpeg not found on PATH (or set FFMPEG_PATH)'));
  const fp = versionOf(ffprobePath(), ['-version']);
  checks.push(check('ffprobe', fp, fp || 'ffprobe not found on PATH (or set FFPROBE_PATH)'));
  try {
    const fonts = registerFonts();
    checks.push(check('fonts', true, fonts.map((f) => `${f.role}=${f.path}`).join('; ')));
  } catch (err) {
    checks.push(check('fonts', false, err.message));
  }
  let python;
  try {
    python = pythonPath();
  } catch (err) {
    checks.push(
      check('python-faster-whisper', false, `config/local.json is not valid JSON: ${err.message}`),
    );
    return checks;
  }
  const py = spawnSync(python, ['-c', 'import faster_whisper; print(faster_whisper.__version__)'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const pyOk = !py.error && py.status === 0;
  checks.push(
    check(
      'python-faster-whisper',
      pyOk,
      pyOk
        ? `faster-whisper ${py.stdout.trim()}`
        : 'Run: python -m pip install -r requirements.txt (or set STUDIO_PYTHON)',
    ),
  );
  return checks;
}

/** Pick the newest general "flash" model that is not TTS, image or lite. */
function chooseReviewModel(modelList) {
  const candidates = modelList
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((name) => /flash/.test(name) && !/tts|image|lite/.test(name));
  candidates.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return candidates[0] || null;
}

async function keyChecks({ fetch, env, writeModels }) {
  const checks = [];
  const missing = (key, name) =>
    check(name, false, `${key} is not set in .env. Get a free key at ${SIGN_UP[key]}`);
  // Stock video is optional: without a key, stock search is off and videos use AI images.
  const optional = (key, name) => ({
    ...check(name, true, `${key} is not set (optional; stock search is off). Key: ${SIGN_UP[key]}`),
    warn: true,
  });

  if (!env.GEMINI_API_KEY) {
    checks.push(missing('GEMINI_API_KEY', 'gemini-key'));
  } else {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      {
        headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      },
    );
    if (!res.ok) {
      checks.push(check('gemini-key', false, `Gemini rejected the key (HTTP ${res.status}).`));
    } else {
      checks.push(check('gemini-key', true, 'Gemini key accepted.'));
      const list = (await res.json()).models || [];
      const config = models();
      const names = list.map((m) => m.name.replace(/^models\//, ''));
      checks.push(
        check(
          'gemini-tts-model',
          names.includes(config.tts),
          names.includes(config.tts)
            ? `${config.tts} is available.`
            : `${config.tts} is not listed; update config/models.json "tts".`,
        ),
      );
      const review =
        config.review && names.includes(config.review) ? config.review : chooseReviewModel(list);
      checks.push(
        check(
          'gemini-review-model',
          review,
          review ? `Review model: ${review}` : 'No flash model found.',
        ),
      );
      if (writeModels && review && review !== config.review) {
        saveModels({ ...config, review, checkedAt: new Date().toISOString() });
      }
    }
  }

  if (!env.PEXELS_API_KEY) {
    checks.push(optional('PEXELS_API_KEY', 'pexels-key'));
  } else {
    const res = await fetch('https://api.pexels.com/videos/search?query=city&per_page=1', {
      headers: { Authorization: env.PEXELS_API_KEY },
    });
    checks.push(
      check('pexels-key', res.ok, res.ok ? 'Pexels key accepted.' : `HTTP ${res.status}`),
    );
  }

  if (!env.PIXABAY_API_KEY) {
    checks.push(optional('PIXABAY_API_KEY', 'pixabay-key'));
  } else {
    const res = await fetch(
      `https://pixabay.com/api/videos/?key=${env.PIXABAY_API_KEY}&q=city&per_page=3`,
    );
    checks.push(
      check('pixabay-key', res.ok, res.ok ? 'Pixabay key accepted.' : `HTTP ${res.status}`),
    );
  }
  return checks;
}

/** Replace every configured secret in a message with "***" (Pixabay only accepts a URL key). */
function redact(text, env) {
  let out = String(text);
  for (const key of ENV_KEYS) {
    if (env[key]) out = out.split(env[key]).join('***');
  }
  return out;
}

async function doctor({ fetch = globalThis.fetch, env = loadEnv(), writeModels = true } = {}) {
  const checks = [...localChecks()];
  try {
    checks.push(...(await keyChecks({ fetch, env, writeModels })));
  } catch (err) {
    checks.push(check('network', false, `Network check failed: ${err.name}: ${err.message}`));
  }
  const safe = checks.map((c) => ({ ...c, detail: redact(c.detail, env) }));
  return { ok: safe.every((c) => c.ok), checks: safe };
}

module.exports = { doctor, chooseReviewModel };
