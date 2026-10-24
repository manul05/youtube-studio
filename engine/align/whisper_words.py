"""Word timings for one audio file with faster-whisper.

Usage: python -I whisper_words.py <audio> <language: en|hi> <out.json> [model-size]

Audio is decoded with FFmpeg into 16 kHz mono float samples (avoids PyAV version issues) and
written as JSON: [{"text": str, "start": float, "end": float}, ...] in UTF-8.
"""

import json
import os
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel


def load_audio(path):
    ffmpeg = os.environ.get("FFMPEG_PATH", "ffmpeg")
    raw = subprocess.run(
        [ffmpeg, "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main():
    audio_path, language, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    size = sys.argv[4] if len(sys.argv) > 4 else "small"
    model = WhisperModel(size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(
        load_audio(audio_path),
        language=language,
        word_timestamps=True,
        beam_size=5,
        condition_on_previous_text=False,
    )
    words = [
        {"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
        for segment in segments
        for w in (segment.words or [])
        if w.word.strip()
    ]
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(words, handle, ensure_ascii=False)


if __name__ == "__main__":
    main()
