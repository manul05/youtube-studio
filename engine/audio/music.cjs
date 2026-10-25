'use strict';

const { loadStyle } = require('../styles/loader.cjs');
const { libraryFile, musicIndex } = require('./library.cjs');

/**
 * One licensed track per chapter, chosen by overlap between the brief's mood and the main
 * style's music moods. The same track never plays in two consecutive chapters (unless the
 * library has only one track).
 */
function pickMusic(brief, plan) {
  const tracks = musicIndex();
  if (!tracks.length) {
    throw new Error(
      'No licensed music in library/music: download tracks from the YouTube Audio Library and ' +
        'list them in library/music/index.json (see library/music/README.md).',
    );
  }
  const moods = new Set([
    ...(brief.mood || []),
    ...(loadStyle(brief.style.main).meta.musicMoods || []),
  ]);
  const ranked = tracks
    .map((t) => ({ t, score: (t.moods || []).filter((m) => moods.has(m)).length }))
    .sort((a, b) => b.score - a.score || a.t.file.localeCompare(b.t.file))
    .map((r) => r.t);
  const picks = [];
  plan.chapters.forEach((chapter, i) => {
    const previous = picks[i - 1] && picks[i - 1].file;
    const track = ranked.find((t) => libraryFile('music', t.file) !== previous) || ranked[0];
    picks.push({ chapterId: chapter.id, file: libraryFile('music', track.file), entry: track });
  });
  return picks;
}

module.exports = { pickMusic };
