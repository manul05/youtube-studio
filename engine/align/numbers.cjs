'use strict';

/**
 * Spell English digits the way a narrator says them, so "15th" from the recogniser can line up
 * with "fifteenth" in the script (and "2026" with "twenty twenty-six"). Only used for matching.
 */

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = [
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
];
const ORDINAL_FIX = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};

function underHundred(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}

function underThousand(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest || !hundreds) parts.push(underHundred(rest));
  return parts.join(' ');
}

function cardinal(n) {
  if (n === 0) return 'zero';
  const parts = [];
  let rest = n;
  for (const [value, name] of SCALES) {
    if (rest >= value) {
      parts.push(`${underThousand(Math.floor(rest / value))} ${name}`);
      rest %= value;
    }
  }
  if (rest) parts.push(underThousand(rest));
  return parts.join(' ');
}

function year(n) {
  if (n >= 2000 && n < 2010) return cardinal(n);
  return `${underHundred(Math.floor(n / 100))} ${n % 100 ? underHundred(n % 100) : 'hundred'}`;
}

function ordinal(n) {
  const words = cardinal(n).split(' ');
  const last = words.pop();
  const fixed =
    ORDINAL_FIX[last] || (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return [...words, fixed].join(' ');
}

/** Devanagari digits (०–९) as ASCII digits. */
function asciiDigits(token) {
  return String(token).replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/** A recogniser token written as digits ("15", "2026", "१५", "40%"). */
function isDigitToken(token) {
  return /^\d[\d,.]*(st|nd|rd|th|%)?[^\p{L}\p{N}]*$/u.test(asciiDigits(token));
}

/** Replace a digit token with words; other tokens are returned unchanged. */
function spellNumber(token) {
  const m = /^(\d[\d,]*)(st|nd|rd|th|%)?([^\p{L}\p{N}]*)$/u.exec(asciiDigits(token));
  if (!m) return token;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isSafeInteger(n) || n >= 1e12) return token;
  let words;
  if (m[2] && m[2] !== '%') words = ordinal(n);
  else if (!m[2] && /^\d{4}$/.test(m[1]) && n >= 1100 && n < 2100) words = year(n);
  else words = cardinal(n) + (m[2] === '%' ? ' percent' : '');
  return words + m[3];
}

module.exports = { spellNumber, cardinal, ordinal, isDigitToken };
