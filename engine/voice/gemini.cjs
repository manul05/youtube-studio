'use strict';

/**
 * Gemini text-to-speech over REST.
 *
 * Request shape checked against https://ai.google.dev/gemini-api/docs/speech-generation on
 * 2026-10-24 (Interactions API): POST /v1beta/interactions with the key in x-goog-api-key;
 * the transcript is input[0].content[0].text (spoken verbatim), delivery style goes in a
 * speech_metadata annotation, the voice in generation_config.speech_config[].voice, and the
 * language is detected automatically. Unary responses carry base64 WAV (24 kHz mono s16) at
 * steps[].content[] where type === "audio". If Google changes the API, only this file changes.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

class RateLimited extends Error {
  constructor(retryAfterSec) {
    super('Gemini free-tier rate limit reached.');
    this.name = 'RateLimited';
    this.retryAfterSec = retryAfterSec;
  }
}

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

function requestBody({ text, voice, style, model }) {
  return {
    model,
    input: [
      {
        type: 'user_input',
        content: [
          {
            type: 'text',
            text,
            annotations: style ? [{ type: 'speech_metadata', style }] : [],
          },
        ],
      },
    ],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: { speech_config: [{ voice }] },
  };
}

function extractAudio(body) {
  const audio = (body.steps || [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || [])
    .filter((item) => item.type === 'audio' && item.data);
  return audio.length ? audio[audio.length - 1] : null;
}

/** Synthesise one transcript. Returns WAV bytes. Throws RateLimited on HTTP 429. */
async function tts({ text, voice, style, model }, { fetch = globalThis.fetch, apiKey } = {}) {
  if (!apiKey) {
    throw new ProviderError('GEMINI_API_KEY is not set. Add it to .env (see npm run doctor).');
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(requestBody({ text, voice, style, model })),
  });
  if (res.status === 429) {
    const retry = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
    throw new RateLimited(Number.isFinite(retry) && retry > 0 ? retry : null);
  }
  if (!res.ok) {
    const detail = String(await res.text()).slice(0, 300);
    throw new ProviderError(`Gemini TTS failed (HTTP ${res.status}): ${detail}`, res.status);
  }
  const audio = extractAudio(await res.json());
  if (!audio) throw new ProviderError('Gemini TTS returned no audio.');
  if (audio.mime_type && !/wav/.test(audio.mime_type)) {
    throw new ProviderError(`Gemini TTS returned ${audio.mime_type}; expected audio/wav.`);
  }
  return Buffer.from(audio.data, 'base64');
}

module.exports = { tts, requestBody, RateLimited, ProviderError, ENDPOINT };
