'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');

const { createProject, openProject } = require('../engine/project.cjs');
const { searchPhotos, pickPhoto, licenceAllowed } = require('../engine/assets/photos.cjs');
const { ledgerIssues, recordImages } = require('../engine/assets/ledger.cjs');
const { writeImagePrompts } = require('../engine/assets/prompts.cjs');
const { checkImages } = require('../engine/assets/images-check.cjs');
const { planIssues } = require('../engine/plan/compile.cjs');

function picture(w, h, seed = 1) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = `hsl(${seed * 47}, 50%, 40%)`;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i += 1) {
    g.fillStyle = `hsl(${(i * 31 + seed * 90) % 360}, 70%, ${20 + ((i * seed) % 6) * 10}%)`;
    g.fillRect((i * 97 + seed * 13) % w, (i * 61 + seed * 7) % h, w / 8, h / 8);
  }
  return c.toBuffer('image/jpeg');
}

function projectWithPlan(beats) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-photos-'));
  const project = openProject(
    createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir }),
  );
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  brief.style = { main: 'editorial', accents: {} };
  fs.writeFileSync(project.path('brief.json'), JSON.stringify(brief));
  const plan = {
    format: 'long',
    fps: 30,
    width: 1920,
    height: 1080,
    frames: 0,
    chapters: [{ id: 1, startFrame: 0, frames: 0 }],
    paragraphs: [],
    beats: beats.map((b, i) => ({
      chapter: 1,
      paragraph: 'c01p01',
      startFrame: i * 150,
      frames: 150,
      style: 'editorial',
      ...b,
    })),
  };
  fs.writeFileSync(project.path('beats.json'), JSON.stringify(plan));
  return project;
}

const photoBeat = (id, query = 'Supreme Court of India building') => ({
  id,
  type: 'art-focus',
  fields: { photoQuery: query, focus: [0.2, 0.2, 0.6, 0.6] },
});

const commonsPage = (n, { licence, width, height, artist, attribution = 'true' }) => ({
  pageid: n,
  title: `File:Photo ${n}.jpg`,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/a/a${n}/Photo_${n}.jpg`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${n}/Photo_${n}.jpg/2560px-Photo_${n}.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:Photo_${n}.jpg`,
      width,
      height,
      mime: 'image/jpeg',
      extmetadata: {
        LicenseShortName: { value: licence },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        Artist: { value: artist },
        AttributionRequired: { value: attribution },
      },
    },
  ],
});

/** Wikimedia Commons and Pixabay answers, plus image downloads; records every request. */
function fakeServices() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, headers: init.headers || {} });
    if (url.startsWith('https://commons.wikimedia.org/w/api.php')) {
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: {
              1: commonsPage(1, {
                licence: 'CC BY-SA 4.0',
                width: 4000,
                height: 2667,
                artist: '<a href="//commons.wikimedia.org/wiki/User:Ravi">Ravi Kumar</a>',
              }),
              2: commonsPage(2, {
                licence: 'CC BY-NC 2.0',
                width: 4000,
                height: 2667,
                artist: 'Someone',
              }),
              3: commonsPage(3, { licence: 'CC0', width: 800, height: 600, artist: 'Small' }),
              4: commonsPage(4, {
                licence: 'Public domain',
                width: 3000,
                height: 2000,
                artist: 'Government of India',
                attribution: 'false',
              }),
            },
          },
        }),
      };
    }
    if (url.startsWith('https://pixabay.com/api/?')) {
      return {
        ok: true,
        json: async () => ({
          hits: [
            {
              id: 11,
              pageURL: 'https://pixabay.com/photos/court-11/',
              user: 'pixuser',
              imageWidth: 5000,
              imageHeight: 3333,
              largeImageURL: 'https://pixabay.com/get/large11.jpg',
            },
            {
              id: 12,
              pageURL: 'https://pixabay.com/photos/court-12/',
              user: 'pixfull',
              imageWidth: 5000,
              imageHeight: 3333,
              largeImageURL: 'https://pixabay.com/get/large12.jpg',
              fullHDURL: 'https://pixabay.com/get/full12.jpg',
            },
          ],
        }),
      };
    }
    if (/^https:\/\/(upload\.wikimedia\.org|pixabay\.com)\//.test(url)) {
      const seed = calls.length;
      return {
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => picture(2560, 1707, seed),
      };
    }
    return { ok: false, status: 404 };
  };
  return { fetch, calls };
}

test('photo licences: free and attributable ones only', () => {
  for (const ok of [
    'CC0',
    'Public domain',
    'PD-India',
    'CC BY 4.0',
    'CC BY-SA 3.0',
    'Pixabay Content License',
  ]) {
    assert.ok(licenceAllowed(ok), ok);
  }
  for (const bad of [
    'CC BY-NC 2.0',
    'CC BY-ND 4.0',
    'CC BY-NC-SA 3.0',
    'Fair use',
    '',
    undefined,
  ]) {
    assert.ok(!licenceAllowed(bad), String(bad));
  }
});

test('photo search keeps large, freely licensed photos from Commons and Pixabay', async () => {
  const project = projectWithPlan([photoBeat('b1')]);
  const services = fakeServices();
  const [result] = await searchPhotos(project, {
    fetch: services.fetch,
    env: { PIXABAY_API_KEY: 'k' },
  });
  assert.equal(result.beat, 'b1');
  assert.equal(result.candidates, 3, 'Commons 1 and 4, Pixabay full-size 12');
  const dir = project.path('assets', 'photos', '_incoming', 'b1');
  assert.ok(fs.existsSync(path.join(dir, 'candidates.jpg')));
  const metas = [1, 2, 3].map((n) =>
    JSON.parse(fs.readFileSync(path.join(dir, `cand_${n}.json`), 'utf8')),
  );
  assert.deepEqual(
    metas.map((m) => m.licence),
    ['CC BY-SA 4.0', 'Public domain', 'Pixabay Content License'],
  );
  assert.equal(metas[0].creator, 'Ravi Kumar', 'HTML is stripped from the author');
  assert.ok(
    services.calls
      .filter((c) => c.url.includes('wikimedia.org'))
      .every((c) => c.headers['User-Agent']),
    'Wikimedia requests identify the tool',
  );
  assert.ok(
    !services.calls.some((c) => c.url.includes('large11')),
    'a 1280 px Pixabay preview is skipped',
  );
});

test('photo search works with no Pixabay key (Commons only)', async () => {
  const project = projectWithPlan([photoBeat('b1')]);
  const services = fakeServices();
  const [result] = await searchPhotos(project, { fetch: services.fetch, env: {} });
  assert.equal(result.candidates, 2);
  assert.ok(!services.calls.some((c) => c.url.startsWith('https://pixabay.com/api/')));
});

test('picking a photo saves it as the beat image and records licence and credit', async () => {
  const project = projectWithPlan([photoBeat('b1')]);
  await searchPhotos(project, { fetch: fakeServices().fetch, env: {} });
  const entry = await pickPhoto(project, 'b1', 1);
  const file = project.path('assets', 'images', 'img_b1.png');
  assert.equal(fs.readFileSync(file).subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(entry.origin, 'stock-photo:wikimedia');
  assert.equal(entry.licence, 'CC BY-SA 4.0');
  assert.equal(entry.attributionRequired, true);
  assert.match(entry.credit, /Ravi Kumar.*Wikimedia Commons.*CC BY-SA 4\.0/);
  assert.match(entry.url, /commons\.wikimedia\.org\/wiki\/File:/);
  assert.deepEqual(ledgerIssues(project), []);
});

test('a photo beat with no picked photo or a non-free licence is flagged', async () => {
  const project = projectWithPlan([photoBeat('b1'), photoBeat('b2')]);
  await searchPhotos(project, { fetch: fakeServices().fetch, env: {} });
  await pickPhoto(project, 'b2', 1);
  const ledgerFile = project.path('assets', 'ledger.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  ledger.images['img_b2.png'].licence = 'CC BY-NC 2.0';
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
  const issues = ledgerIssues(project);
  assert.ok(issues.some((i) => /b1: no stock photo picked \(npm run photos:search/.test(i)));
  assert.ok(issues.some((i) => /b2: .*licence "CC BY-NC 2\.0" is not allowed/.test(i)));
});

test('photo beats are not AI prompts, and images:check points to photos:search', async () => {
  const project = projectWithPlan([
    photoBeat('b1'),
    {
      id: 'b2',
      type: 'art-focus',
      fields: { imagePrompt: 'a courtroom', focus: [0.2, 0.2, 0.6, 0.6] },
    },
  ]);
  writeImagePrompts(project);
  const md = fs.readFileSync(project.path('assets', 'IMAGE_PROMPTS.md'), 'utf8');
  assert.ok(!/## \d+\. img_b1\.png/.test(md), 'no AI prompt for a photo beat');
  assert.match(md, /img_b2\.png/);
  assert.equal(recordImages(project, { origin: 'agent-generated:codex' }), 0);
  const problems = await checkImages(project);
  const b1 = problems.find((p) => p.file === 'img_b1.png');
  assert.match(b1.problem, /photos:search/);
});

test('an art beat needs an image prompt or a photo query, not both', () => {
  const plan = {
    fps: 30,
    paragraphs: [],
    chapters: [],
    beats: [
      { id: 'a', type: 'art-focus', frames: 120, fields: { focus: [0.1, 0.1, 0.5, 0.5] } },
      {
        id: 'b',
        type: 'art-focus',
        frames: 120,
        fields: { imagePrompt: 'x', photoQuery: 'y', focus: [0.1, 0.1, 0.5, 0.5] },
      },
      {
        id: 'c',
        type: 'art-focus',
        frames: 120,
        fields: { photoQuery: 'y', focus: [0.1, 0.1, 0.5, 0.5] },
      },
    ],
  };
  const issues = planIssues(plan, { claims: [] });
  assert.ok(issues.some((i) => /^a: .*imagePrompt.*photoQuery/.test(i)));
  assert.ok(issues.some((i) => /^b: .*not both/.test(i)));
  assert.ok(!issues.some((i) => i.startsWith('c:')));
});

test('the description credits every photo that needs attribution', async () => {
  const { photoCredits } = require('../engine/package/description.cjs');
  const project = projectWithPlan([photoBeat('b1'), photoBeat('b2')]);
  await searchPhotos(project, { fetch: fakeServices().fetch, env: {} });
  await pickPhoto(project, 'b1', 1);
  await pickPhoto(project, 'b2', 2);
  const credits = photoCredits(project);
  assert.equal(credits.length, 1, 'public-domain photo needs no credit');
  assert.match(credits[0], /Ravi Kumar/);
  assert.match(credits[0], /https:\/\/commons\.wikimedia\.org\/wiki\/File:Photo_1\.jpg/);
});
