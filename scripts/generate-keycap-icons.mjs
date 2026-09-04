// Generates Codex Micro keycap SVGs for Codex Deck from permissively-licensed icon sets.
// Lucide (ISC). Output: ~/Library/Application Support/CodexDeck/icons/<KEYCAP_ID>.svg
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LUCIDE = process.argv[2] ?? "node_modules/lucide-static/icons";
const OUT = process.argv[3] ?? join(homedir(), 'Library/Application Support/CodexDeck/icons');

// Plugin scales the icon by 90/24 and its own built-in glyphs use stroke-width 5 on a 144 canvas.
// 5 / (90/24) = 1.333 -> match that instead of Lucide's default 2.
const STROKE = 1.35;

const MAP = {
  FAST: 'zap', APPR: 'check', REJ: 'x', SPLIT: 'git-fork',
  MIC: 'mic', MIC1: 'mic-vocal', CODEX: 'bot', BUG: 'bug', OAI: 'book-open',
  TERM: 'terminal', DWN: 'download', DEL: 'trash-2', NEW: 'square-pen',
  NAV: 'compass', MAGIC: 'wand-sparkles', DIFF: 'git-compare', PLAY: 'play',
  GIT: 'git-commit-horizontal', BRCH: 'git-branch', BRANCH: 'git-branch',
  MRG: 'git-merge', PR: 'git-pull-request', PAINT: 'paintbrush',
  LAB: 'flask-conical', PARTY: 'party-popper', TIME: 'clock',
  SETUP: 'settings', FOLD: 'folder-open', UPL: 'upload', APPS: 'layout-grid',
  EMPT1: 'square', EMPT2: 'square', EMPT3: 'square', EMPT4: 'square', EMPT5: 'square'
};

const body = (name) => {
  const raw = readFileSync(join(LUCIDE, `${name}.svg`), 'utf8');
  const inner = raw.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i)?.[1];
  if (!inner) throw new Error(`no body in ${name}`);
  return inner.trim().replace(/\s*\n\s*/g, '');
};

// The plugin copies only the INNER content of the file and drops root attributes,
// so stroke settings must live on a wrapper <g> or the glyph renders invisible.
const wrap = (inner, extra = '') => `<!-- Icon: Lucide (ISC). Generated for local Codex Deck use. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<g fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>${extra}
</svg>
`;

mkdirSync(OUT, { recursive: true });
const written = [];

for (const [id, icon] of Object.entries(MAP)) {
  writeFileSync(join(OUT, `${id}.svg`), wrap(body(icon)));
  written.push(`${id} <- ${icon}`);
}

// MIND+ / MIND-: reasoning effort. Brain, shrunk, with a +/- badge top-right.
// stroke-width is divided by each group's scale so both strokes render at the same weight.
for (const [id, sign] of [['MIND+', 'plus'], ['MIND-', 'minus']]) {
  const brainScale = 0.84, badgeScale = 0.44;
  const inner =
    `<g transform="translate(-0.4 2.6) scale(${brainScale})" stroke-width="${(STROKE / brainScale).toFixed(3)}">${body('brain')}</g>` +
    `<g transform="translate(14.9 0.6) scale(${badgeScale})" stroke-width="${(STROKE / badgeScale).toFixed(3)}">${body(sign)}</g>`;
  writeFileSync(join(OUT, `${id}.svg`), wrap(inner));
  written.push(`${id} <- brain + ${sign}`);
}

// YOLO / YEET have no art in Codex either - the app renders literal text legends.
for (const [id, legend] of [['YOLO', ':yolo:'], ['YEET', ':yeet:']]) {
  const text = `<text x="12" y="12" text-anchor="middle" dominant-baseline="central" `
    + `font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="6" `
    + `font-weight="600" letter-spacing="-0.2" fill="currentColor" stroke="none">${legend}</text>`;
  writeFileSync(join(OUT, `${id}.svg`), `<!-- Text legend, matching Codex's own rendering. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g>${text}</g></svg>
`);
  written.push(`${id} <- text ${legend}`);
}

console.log(`wrote ${written.length} icons to ${OUT}`);
for (const w of written) console.log('  ' + w);
