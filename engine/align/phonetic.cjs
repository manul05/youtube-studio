'use strict';

/**
 * A rough "sounds-like" spelling used only to line up the script with speech recognition
 * output. Speech recognisers spell Hindi loosely (पंद्रह → पन्द्रा, टिप्पणी → तिप्पनी), and
 * Hinglish scripts may be written in Roman letters while the recogniser writes Devanagari.
 * Both sides are therefore reduced to the same coarse Latin skeleton:
 *   - Devanagari is romanised without the inherent vowel; aspirated and retroflex consonants
 *     merge with their plain/dental partners; ष/श/स → s; anusvara → n;
 *   - all "a" vowels are dropped, e ≈ i, y ≈ i, w → v, z → j, c/q → k, h is dropped;
 *   - repeated letters collapse.
 * It is deliberately lossy: it only has to make the same spoken word look alike.
 */

const CONSONANTS = {
  क: 'k',
  ख: 'k',
  ग: 'g',
  घ: 'g',
  ङ: 'n',
  च: 'C',
  छ: 'C',
  ज: 'j',
  झ: 'j',
  ञ: 'n',
  ट: 't',
  ठ: 't',
  ड: 'd',
  ढ: 'd',
  ण: 'n',
  त: 't',
  थ: 't',
  द: 'd',
  ध: 'd',
  न: 'n',
  प: 'p',
  फ: 'f',
  ब: 'b',
  भ: 'b',
  म: 'm',
  य: 'i',
  र: 'r',
  ल: 'l',
  ळ: 'l',
  व: 'v',
  श: 's',
  ष: 's',
  स: 's',
  ह: '',
};
// Consonant + nukta.
const NUKTA_FORMS = { क: 'k', ख: 'k', ग: 'g', ज: 'j', ड: 'r', ढ: 'r', फ: 'f', य: 'i' };
const MATRAS = {
  'ा': '', // ा
  'ि': 'i', // ि
  'ी': 'i', // ी
  'ु': 'u', // ु
  'ू': 'u', // ू
  'ृ': 'ri', // ृ
  'ॅ': 'o', // ॅ
  'े': 'i', // े
  'ै': 'i', // ै
  'ॉ': 'o', // ॉ
  'ो': 'o', // ो
  'ौ': 'o', // ौ
};
const VOWELS = {
  अ: '',
  आ: '',
  इ: 'i',
  ई: 'i',
  उ: 'u',
  ऊ: 'u',
  ऋ: 'ri',
  ए: 'i',
  ऐ: 'i',
  ओ: 'o',
  औ: 'o',
  ऑ: 'o',
  ऍ: 'o',
};
const NUKTA = '़';
const SILENT = new Set(['्', 'ः', NUKTA]); // virama, visarga, stray nukta
const NASAL = new Set(['ँ', 'ं']); // chandrabindu, anusvara

function romaniseDevanagari(text) {
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (CONSONANTS[ch] !== undefined) {
      if (chars[i + 1] === NUKTA) {
        out += NUKTA_FORMS[ch] ?? CONSONANTS[ch];
        i += 1;
      } else {
        out += CONSONANTS[ch];
      }
    } else if (MATRAS[ch] !== undefined) out += MATRAS[ch];
    else if (VOWELS[ch] !== undefined) out += VOWELS[ch];
    else if (NASAL.has(ch)) out += 'n';
    else if (!SILENT.has(ch)) out += ch;
  }
  return out;
}

function phonetic(token) {
  let s = String(token).normalize('NFC').toLowerCase();
  s = s.replace(/ch/g, 'C').replace(/ck/g, 'k').replace(/ph/g, 'f').replace(/sh/g, 's');
  s = romaniseDevanagari(s);
  s = s
    .replace(/x/g, 'ks')
    .replace(/[cq]/g, 'k')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/[ye]/g, 'i')
    .replace(/[ah]/g, '');
  s = s.replace(/[^a-z0-9C]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

module.exports = { phonetic };
