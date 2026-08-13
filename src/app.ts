import type { PatchIndex, PatchIndexEntry, GameDef } from './core/types';
import type { ZipEntry } from './core/zip';
import type { ValidationResult } from './core/patch';
import { readZipEntries } from './core/zip';
import { validate, buildPatchedSet, effectivePatchFiles } from './core/patch';
import { buildMameOutput } from './core/output/mame';
import { buildNeoOutput } from './core/output/neo';
import { buildDarksoftOutput } from './core/output/darksoft';
import type { OutputFormat, PatchVariant } from './core/types';
import { renderMarkdown } from './core/md';
import { randomQuote, type Quote } from './quotes';

// ---------- DOM helpers ----------
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}

/** URL of a served resource, relative to the page (compatible with GitHub Pages /repo/). */
function url(path: string): string {
  return new URL(path, document.baseURI).href;
}

function downloadBytes(data: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([data.slice().buffer], { type: mime });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

// ---------- state ----------
interface State {
  index: PatchIndex | null;
  error: string | null;
  selectedGameId: string | null;
  selectedPatchId: string | null;
  selectedVariantId: string | null;
  entries: ZipEntry[];
  validation: ValidationResult | null;
  busy: boolean;
  result: { type: 'ok' | 'err'; text: string } | null;
  quote: Quote;
  format: OutputFormat;
  activeTab: 'description' | 'notes';
}

const state: State = {
  index: null,
  error: null,
  selectedGameId: null,
  selectedPatchId: null,
  selectedVariantId: null,
  entries: [],
  validation: null,
  busy: false,
  result: null,
  quote: randomQuote(),
  format: 'mame',
  activeTab: 'description',
};

let root: HTMLElement;

function selectedPatch(): PatchIndexEntry | null {
  if (!state.index || !state.selectedPatchId) return null;
  return state.index.patches.find((p) => p.id === state.selectedPatchId) ?? null;
}
function gameOf(patch: PatchIndexEntry): GameDef | null {
  return state.index?.games[patch.game] ?? null;
}
/** A teaser game (shown in the grid + its description, but no patch tool) — "coming soon" or "later". */
function isComing(g: GameDef): boolean {
  return !!(g.comingSoon || g.comingLater);
}
/** The grid-ribbon / tag label for a teaser game (null if it isn't a teaser). */
function comingLabel(g: GameDef): string | null {
  return g.comingSoon ? 'Coming soon' : g.comingLater ? 'Coming later' : null;
}
/** Currently selected variant (or the first one) for a patch that has variants; null otherwise. */
function selectedVariant(): PatchVariant | null {
  const p = selectedPatch();
  if (!p?.variants?.length) return null;
  return p.variants.find((v) => v.id === state.selectedVariantId) ?? p.variants[0];
}

function gamesWithPatches(): GameDef[] {
  const idx = state.index;
  if (!idx) return [];
  const ids = [...new Set(idx.patches.map((p) => p.game))];
  return ids.map((id) => idx.games[id]).filter((g): g is GameDef => !!g);
}
// MAME zip(s) the user must drop for this game: the set itself, plus the parent set for split
// clone sets (whose shared files live in the parent zip).
function requiredZips(game: GameDef | null): string[] {
  if (!game) return [];
  return [`${game.id}.zip`, ...(game.parent ? [`${game.parent}.zip`] : [])];
}
function patchesForGame(gameId: string): PatchIndexEntry[] {
  return state.index?.patches.filter((p) => p.game === gameId) ?? [];
}

function resetSelection() {
  state.entries = [];
  state.validation = null;
  state.result = null;
  state.activeTab = 'description'; // always land on Description when switching game/patch
}

function selectGame(id: string) {
  if (state.selectedGameId === id) return; // already selected - keep current state (don't reset upload)
  state.selectedGameId = id;
  const game = state.index?.games[id];
  const ps = patchesForGame(id);
  // Coming-soon games are teasers: never select a patch (they show a description, no patch tool).
  if (!(game && isComing(game)) && ps.length) {
    selectPatch(ps[0].id); // auto-select the first patch so its description shows directly
  } else {
    state.selectedPatchId = null;
    resetSelection();
    render();
  }
}

function selectPatch(id: string) {
  state.selectedPatchId = id;
  state.selectedVariantId = state.index?.patches.find((p) => p.id === id)?.variants?.[0]?.id ?? null;
  resetSelection();
  state.quote = randomQuote();
  render();
}

function selectVariant(id: string) {
  state.selectedVariantId = id;
  state.result = null;
  revalidate(); // re-marks which files are patched for the new variant
  render();
}

function revalidate() {
  const patch = selectedPatch();
  const game = patch && gameOf(patch);
  if (!patch || !game) {
    state.validation = null;
    return;
  }
  const resolved = { ...patch, files: effectivePatchFiles(patch, selectedVariant()) };
  state.validation = validate(game, resolved, state.entries);
}

async function addFiles(files: FileList | File[]) {
  state.result = null;
  const bad: string[] = [];
  for (const file of Array.from(files)) {
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const entries = readZipEntries(buf);
      // avoid exact duplicates (same name + same CRC)
      for (const e of entries) {
        if (!state.entries.some((x) => x.name === e.name && x.crc32 === e.crc32)) {
          state.entries.push(e);
        }
      }
    } catch {
      bad.push(file.name);
    }
  }
  revalidate();
  // Only show a read error if it actually prevents validation
  // (one unreadable zip among others must not hide an otherwise complete ROM).
  if (bad.length && !state.validation?.ok) {
    state.result = { type: 'err', text: `Unreadable zip(s): ${bad.join(', ')}.` };
  }
  render();
}

async function generate() {
  const patch = selectedPatch();
  const game = patch && gameOf(patch);
  if (!patch || !game || !state.validation?.ok) return;
  state.busy = true;
  state.result = null;
  render();
  try {
    const files = effectivePatchFiles(patch, selectedVariant());
    const ipsByPath: Record<string, Uint8Array> = {};
    await Promise.all(
      files.map(async (pf) => {
        const res = await fetch(url(`${patch.baseDir}/${pf.ips}`));
        if (!res.ok) throw new Error(`Failed to download patch "${pf.ips}".`);
        ipsByPath[pf.ips] = new Uint8Array(await res.arrayBuffer());
      }),
    );
    const resolved = { ...patch, files };
    const patched = buildPatchedSet(game, resolved, state.entries, ipsByPath);
    const out =
      state.format === 'neo'
        ? buildNeoOutput(game, patched)
        : state.format === 'darksoft'
          ? buildDarksoftOutput(game, patched, files.map((f) => f.rom))
          : buildMameOutput(game, patched);
    downloadBytes(out.data, out.filename, out.mime);
    state.result = { type: 'ok', text: `✓ ${out.filename} generated and downloaded.` };
  } catch (e) {
    state.result = { type: 'err', text: e instanceof Error ? e.message : String(e) };
  } finally {
    state.busy = false;
    render();
  }
}

// ---------- rendering ----------
const KOFI_URL = 'https://ko-fi.com/boomchil';
const ISSUES_URL = 'https://github.com/Boomchil/neo-geo-romhacks/issues';
const DISCORD_URL = 'https://discord.gg/QvYCmHDb6';
// Official Discord mark (inline SVG; fill=currentColor so it follows the link colour + hover).
const DISCORD_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
  '<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>';

// Info popup whose body is loaded from a Markdown file in public/pages/.
function openInfoModal(title: string, mdPath: string) {
  const body = h('div', { class: 'modal-body desc' }, 'Loading…');
  const overlay = h(
    'div',
    { class: 'modal-overlay', onclick: (e: Event) => e.target === overlay && close() },
    h(
      'div',
      { class: 'modal' },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', { class: 'modal-title' }, title),
        h('button', { class: 'modal-close', 'aria-label': 'Close', onclick: () => close() }, '×'),
      ),
      body,
    ),
  );
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  fetch(url(mdPath))
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('not found'))))
    .then((md) => {
      body.innerHTML = renderMarkdown(md);
    })
    .catch(() => {
      body.textContent = 'Content not available yet.';
    });
}

function header(): HTMLElement {
  const links = h(
    'div',
    { class: 'header-links' },
    h('button', { class: 'hlink', onclick: () => openInfoModal('Disclaimer', 'pages/disclaimer.md') }, 'Disclaimer'),
    h('button', { class: 'hlink', onclick: () => openInfoModal('Thanks', 'pages/thanks.md') }, 'Thanks'),
    h('button', { class: 'hlink', onclick: () => openInfoModal('Questions? Remarks?', 'pages/contact.md') }, 'Questions? Remarks?'),
    h('a', {
      class: 'hlink hlink-icon',
      href: DISCORD_URL,
      target: '_blank',
      rel: 'noopener noreferrer',
      html: DISCORD_ICON + '<span>Discord</span>',
    }),
    h(
      'a',
      { class: 'hlink', href: KOFI_URL, target: '_blank', rel: 'noopener noreferrer' },
      'Like my work? Buy me a coffee  ☕',
    ),
  );
  return h(
    'header',
    { class: 'site-header' },
    h('h1', { class: 'logo' }, "NEO•GEO romhacks"),
    links,
    h('div', { class: 'gold-rule' }),
    h(
      'p',
      {
        class: 'splash',
        title: 'Click for another',
        onclick: () => {
          state.quote = randomQuote();
          render();
        },
      },
      state.quote.author ? `“${state.quote.text}” - ${state.quote.author}` : state.quote.text,
    ),
  );
}

function gameCard(game: GameDef): HTMLElement {
  // Logo only; the name shows as a fallback when there's no logo (or it fails to load).
  const fallback = h('div', { class: 'game-name' }, game.name);
  const inner: Node[] = [];
  if (game.logo) {
    fallback.style.display = 'none';
    const img = h('img', {
      src: url(game.logo), // index-resolved served-relative path (e.g. patches/<game>/logo.png)
      alt: game.name,
      loading: 'lazy',
      onerror: () => {
        img.style.display = 'none';
        fallback.style.display = '';
      },
    });
    // Optional per-game logo zoom (game.json "logoZoom" %, default 100).
    if (game.logoZoom && game.logoZoom !== 100) {
      img.style.setProperty('--logo-zoom', String(game.logoZoom / 100));
    }
    inner.push(img);
  }
  inner.push(fallback);
  const card = h(
    'button',
    {
      class:
        'game-card' +
        (state.selectedGameId === game.id ? ' selected' : '') +
        (isComing(game) ? ' coming' : ''),
      onclick: () => selectGame(game.id),
    },
    h('div', { class: 'game-logo' }, ...inner),
  );
  // Teaser games stay clickable (they show a description) but carry a corner ribbon (soon / later).
  const label = comingLabel(game);
  if (label) card.append(h('div', { class: 'coming-badge' }, label));
  return card;
}

function gamesView(): HTMLElement {
  const withPatch = gamesWithPatches();
  const seen = new Set(withPatch.map((g) => g.id));
  const soonNoPatch = state.index
    ? Object.values(state.index.games).filter((g) => isComing(g) && !seen.has(g.id))
    : [];
  // Order: available games first (playable = has a patch and not a teaser), then "coming soon", then
  // "coming later" (whether or not they already have a patch, e.g. a released hack re-flagged as soon).
  const available = withPatch.filter((g) => !isComing(g));
  const coming = [...withPatch.filter((g) => isComing(g)), ...soonNoPatch];
  const soon = coming.filter((g) => g.comingSoon);
  const later = coming.filter((g) => g.comingLater && !g.comingSoon);
  const games = [...available, ...soon, ...later];
  const grid = h('div', { class: 'games-grid' });
  if (!games.length) grid.append(h('div', { class: 'empty' }, 'No patches available yet.'));
  for (const g of games) grid.append(gameCard(g));
  return h('section', { class: 'view games-view' }, grid);
}

// One-line validation summary under the dropzone: all files OK, or just the ones in error.
function fileStatus(): HTMLElement {
  const v = state.validation;
  if (!v) return h('div');
  if (v.ok) {
    return h('div', { class: 'file-status ok' }, `✓ All ${v.files.length} files verified - ready to patch`);
  }
  return h(
    'div',
    { class: 'file-status err' },
    `✕ ${v.missing.length} file(s) missing or incorrect: ${v.missing.join(', ')}`,
  );
}

function dropzone(requiredZips: string[]): HTMLElement {
  const input = h('input', {
    type: 'file',
    accept: '.zip,application/zip',
    multiple: true,
    class: 'hidden',
    onchange: (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.files) void addFiles(t.files);
      t.value = '';
    },
  });
  // Main label names exactly the zip file(s) to drop (the set + its parent for split clone sets).
  const label = h('div', { class: 'dz-label' });
  if (requiredZips.length) {
    label.append('Drop ');
    requiredZips.forEach((z, i) => {
      if (i > 0) label.append(' + ');
      label.append(h('code', { class: 'zip-name' }, z));
    });
    label.append(' here, or click to browse');
  } else {
    label.append('Drop your MAME zip(s) here, or click to browse');
  }
  const dz = h(
    'div',
    {
      class: 'dropzone',
      onclick: () => input.click(),
      ondragover: (e: Event) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.add('drag');
      },
      ondragleave: (e: Event) => (e.currentTarget as HTMLElement).classList.remove('drag'),
      ondrop: (e: Event) => {
        const ev = e as DragEvent;
        ev.preventDefault();
        (ev.currentTarget as HTMLElement).classList.remove('drag');
        if (ev.dataTransfer?.files) void addFiles(ev.dataTransfer.files);
      },
    },
    h('div', { class: 'dz-icon' }, '⬆'),
    label,
    input,
  );
  return dz;
}

const FORMATS: { id: OutputFormat; name: string; sub: string }[] = [
  {
    id: 'mame',
    name: 'Zipped ROM file',
    sub: 'MAME format, for use with MAME and compatible emulators, or the BackBit cartridge.'
  },
  {
    id: 'neo',
    name: '.neo file',
    sub: 'For use with NeoSD, MiSTer FPGA, or the Geolith emulator.'
  },
  {
    id: 'darksoft',
    name: 'Darksoft',
    sub: 'For use with the Darksoft linker.'
  },
];

function formats(): HTMLElement {
  ''
  const row = h('div', { class: 'formats' });
  for (const o of FORMATS) {
    row.append(
      h(
        'div',
        {
          class: 'fmt' + (state.format === o.id ? ' active' : ''),
          onclick: () => {
            state.format = o.id;
            state.result = null;
            render();
          },
        },
        h('div', { class: 'fmt-name' }, o.name),
        h('div', { class: 'fmt-sub' }, o.sub),
      ),
    );
  }
  return row;
}

function versionSelector(patch: PatchIndexEntry): HTMLElement {
  const sel = selectedVariant();
  const row = h('div', { class: 'versions' });
  for (const variant of patch.variants ?? []) {
    row.append(
      h(
        'button',
        {
          class: 'version' + (sel?.id === variant.id ? ' active' : ''),
          onclick: () => selectVariant(variant.id),
        },
        variant.label,
      ),
    );
  }
  return h('div', { class: 'version-row' }, h('span', { class: 'version-label' }, 'Version'), row);
}

// "Choose patch" buttons - shown only when the game has more than one patch. Clicking selects a
// patch (its description updates above and its short summary shows under the buttons).
function patchPicker(game: GameDef | null): Node {
  if (!game) return document.createTextNode('');
  const patches = patchesForGame(game.id);
  if (patches.length < 2) return document.createTextNode('');
  const row = h('div', { class: 'patch-buttons' });
  for (const p of patches) {
    row.append(
      h(
        'button',
        { class: 'patch-btn' + (p.id === state.selectedPatchId ? ' active' : ''), onclick: () => selectPatch(p.id) },
        p.name ?? p.id,
      ),
    );
  }
  const sel = selectedPatch();
  return h(
    'section',
    { class: 'patch-picker' },
    h('h2', { class: 'view-title' }, 'Choose patch'),
    row,
    sel?.summary ? h('p', { class: 'patch-picker-summary' }, sel.summary) : document.createTextNode(''),
  );
}

// A tabbed panel (Description / Dev notes & trivia). Tabs switch in place — no full re-render — so the
// patch tool, any uploaded ROMs and gallery state are preserved. The active tab is kept in
// state.activeTab so it survives a real re-render (e.g. picking a variant). Only rendered when there
// are ≥2 panels; a single panel is returned as-is.
function descTabs(panels: { id: 'description' | 'notes'; label: string; body: HTMLElement }[]): HTMLElement {
  if (panels.length < 2) return panels[0].body;
  const active = panels.some((p) => p.id === state.activeTab) ? state.activeTab : panels[0].id;
  const bar = h('div', { class: 'desc-tabs', role: 'tablist' });
  const stack = h('div', { class: 'desc-tabpanels' });
  const btns: HTMLButtonElement[] = [];
  const bodies: HTMLElement[] = [];
  panels.forEach((p) => {
    const on = p.id === active;
    const btn = h('button', { class: 'desc-tab' + (on ? ' active' : ''), type: 'button' }, p.label);
    const panel = h('div', { class: 'desc-tabpanel' + (on ? ' active' : '') }, p.body);
    btn.addEventListener('click', () => {
      state.activeTab = p.id;
      btns.forEach((b, i) => b.classList.toggle('active', panels[i].id === p.id));
      bodies.forEach((b, i) => b.classList.toggle('active', panels[i].id === p.id));
    });
    btns.push(btn);
    bodies.push(panel);
    bar.append(btn);
    stack.append(panel);
  });
  return h('div', { class: 'desc-tabbed' }, bar, stack);
}

function patchView(patch: PatchIndexEntry): HTMLElement {
  const game = gameOf(patch);
  const v = state.validation;
  const canGen = !!v?.ok && !state.busy;

  // Optional standalone title (only when the patch declares an explicit name; otherwise the title
  // lives in description.md as its first heading).
  const titleEl = patch.name ? h('h2', { class: 'patch-title' }, patch.name) : null;

  // Rendered description body.
  const descBody = h('div', {
    class: 'desc',
    html: renderMarkdown((selectedVariant()?.description ?? patch.description) || `## ${patch.name ?? patch.id}`, {
      baseUrl: url(`${patch.baseDir}/`),
    }),
  });

  // Show the version inline, right after the patch title (the explicit name, or the first heading
  // of the rendered markdown).
  if (patch.version) {
    const chip = h('span', { class: 'patch-version' }, `v${patch.version}`);
    const target = titleEl ?? descBody.querySelector('h1, h2, h3, h4');
    if (target) target.append(chip);
    else descBody.prepend(chip);
  }

  // Optional "Dev notes & trivia" tab (notes.md) for more technical / behind-the-scenes content.
  const notesBody = patch.notes
    ? h('div', { class: 'desc', html: renderMarkdown(patch.notes, { baseUrl: url(`${patch.baseDir}/`) }) })
    : null;
  const body = notesBody
    ? descTabs([
      { id: 'description', label: 'Description', body: descBody },
      { id: 'notes', label: 'Dev notes & trivia', body: notesBody },
    ])
    : descBody;

  // Full-width description block: optional issues link, optional title, then the description (tabbed
  // with "Dev notes & trivia" when the patch has a notes.md).
  const description = h(
    'div',
    { class: 'patch-desc' },
    patch.issuesUrl
      ? h('a', { class: 'issues-link', href: patch.issuesUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Report an issue ↗')
      : document.createTextNode(''),
    titleEl ?? document.createTextNode(''),
    body,
  );

  const actions = h(
    'div',
    { class: 'actions' },
    h(
      'button',
      { class: 'btn', disabled: !canGen, onclick: () => void generate() },
      state.busy ? 'Generating…' : 'Generate & download',
    ),
    state.result
      ? h('span', { class: 'msg ' + (state.result.type === 'ok' ? 'ok' : 'err') }, state.result.text)
      : document.createTextNode(''),
  );

  // The patch tool (upload → validate → format → generate), below everything.
  const tool = h(
    'aside',
    { class: 'patch-tool panel' },
    h('h3', { class: 'side-title' }, 'Patch your ROM'),
    patch.variants?.length ? versionSelector(patch) : document.createTextNode(''),
    dropzone(requiredZips(game)),
    state.entries.length > 0 ? fileStatus() : document.createTextNode(''),
    h('div', { class: 'field-label' }, 'Choose your output format'),
    formats(),
    state.format === 'darksoft'
      ? h(
        'div',
        { class: 'fmt-note' },
        'Please note that only the files this patch changes are produced. Drop them into your existing games/' +
        (game?.id ?? '') +
        '/ folder, keeping the others (m1rom, vroma0, crom0, fpga).',
      )
      : state.format === 'neo'
        ? h(
          'div',
          { class: 'fmt-note' },
          'The .neo file also works with the Geolith emulator and the MiSTer FPGA Neo Geo core: they use the same format as the NeoSD.',
        )
        : h(
          'div',
          { class: 'fmt-note' },
          'Warning: MAME checks ROM checksums, so it flags a patched set as a bad dump. Launch it from the command line (mame ' +
          (game?.id ?? '<game>') +
          ') to run past the warning.',
        ),
    actions,
  );

  // Order: description (wide) → choose-patch (if several) → the patch tool.
  return h('section', { class: 'view' }, description, patchPicker(game), tool);
}

function footer(): HTMLElement {
  return h(
    'footer',
    { class: 'site-footer' },
    h(
      'div',
      { class: 'footer-feedback' },
      'Found a bug? ',
      h(
        'a',
        { class: 'footer-link', href: ISSUES_URL, target: '_blank', rel: 'noopener noreferrer' },
        'Open an issue on GitHub ↗',
      ),
    ),
    h('div', { class: 'copyright' }, '© 2026 Jérémy Lemaire aka Boomchil'),
    h(
      'div',
      { class: 'legal' },
      'Neo Geo® and SNK® are trademarks or registered trademarks of SNK Corporation. ' +
      'This is an unofficial, non-commercial fan project, not affiliated with, endorsed by, or sponsored by SNK. ' +
      'No copyrighted ROM data is distributed.',
    ),
  );
}

// Play preview clips only while visible (muted autoplay loop, GIF-like), pause off-screen.
let videoObserver: IntersectionObserver | null = null;
function setupMedia() {
  // Videos play only while on screen.
  if (typeof IntersectionObserver !== 'undefined') {
    videoObserver?.disconnect();
    videoObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) void v.play().catch(() => { });
          else v.pause();
        }
      },
      { threshold: 0.25 },
    );
    root.querySelectorAll<HTMLVideoElement>('.desc-video').forEach((v) => videoObserver!.observe(v));
  }
  // Gallery carousels: click a thumbnail to show it (×2) in the stage; the first is selected.
  root.querySelectorAll<HTMLElement>('.gallery').forEach((gal) => {
    const stage = gal.querySelector<HTMLElement>('.gallery-stage');
    const strip = gal.querySelector<HTMLElement>('.gallery-strip');
    const thumbs = Array.from(gal.querySelectorAll<HTMLElement>('.gallery-thumb'));
    if (!stage || !thumbs.length) return;
    const select = (thumb: HTMLElement, animate = true) => {
      for (const t of thumbs) t.classList.toggle('is-active', t === thumb);
      stage.replaceChildren();
      const type = thumb.dataset.type;
      const src = thumb.dataset.src ?? '';
      const cap = thumb.dataset.caption ?? '';
      if (type === 'ba') {
        // before/after: two images stacked, the top one cross-toggled by CSS (blink)
        const layers = document.createElement('span');
        layers.className = 'ba-layers';
        const layer = (s: string, cls: string, alt: string) => {
          const span = document.createElement('span');
          span.className = cls;
          const im = document.createElement('img');
          im.src = s;
          im.alt = alt;
          span.append(im);
          return span;
        };
        layers.append(layer(src, 'ba-a', cap), layer(thumb.dataset.srcB ?? '', 'ba-b', ''));
        stage.append(layers);
      } else if (type === 'video') {
        const v = document.createElement('video');
        v.className = 'stage-media';
        v.src = src;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.autoplay = true;
        stage.append(v);
        void v.play().catch(() => { });
      } else {
        const img = document.createElement('img');
        img.className = 'stage-media';
        img.src = src;
        img.alt = cap;
        stage.append(img);
      }
      // Always render the caption (even empty) so the layout keeps a reserved line and doesn't jump.
      const fc = document.createElement('figcaption');
      fc.textContent = cap;
      stage.append(fc);
      // keep the selected thumbnail centered in the strip (scrolls the strip only, not the page)
      if (strip) {
        const target = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
        strip.scrollTo({ left: Math.max(0, target), behavior: animate ? 'smooth' : 'auto' });
      }
    };
    thumbs.forEach((t) => t.addEventListener('click', () => select(t)));
    select(thumbs[0], false); // first media selected by default (no scroll animation)
  });
}

// Selected game that has no patch yet: show its (game-level) description with a "Coming soon" tag,
// and no patch tool.
function comingSoonView(game: GameDef): HTMLElement {
  // Reuse the final patch's description when one exists, so the teaser matches the released page;
  // otherwise fall back to a game-level description.md.
  const patch = patchesForGame(game.id)[0];
  const md = patch?.description || game.description;
  const notesMd = patch?.notes || game.notes;
  const base = patch?.baseDir ?? game.baseDir ?? `patches/${game.id}`;
  const baseUrl = url(`${base}/`);
  const body = md
    ? h('div', { class: 'desc', html: renderMarkdown(md, { baseUrl }) })
    : h('p', { class: 'coming-soon-note' }, 'This one is still in the works, stay tuned!');
  const content = notesMd
    ? descTabs([
      { id: 'description', label: 'Description', body },
      { id: 'notes', label: 'Dev notes & trivia', body: h('div', { class: 'desc', html: renderMarkdown(notesMd, { baseUrl }) }) },
    ])
    : body;
  return h(
    'section',
    { class: 'view patch-desc' },
    h('span', { class: 'coming-soon-tag' }, comingLabel(game) ?? 'Coming soon'),
    content,
  );
}

function render() {
  root.replaceChildren();
  root.append(header());
  if (state.error) {
    root.append(h('div', { class: 'empty msg err' }, state.error));
    root.append(footer());
    return;
  }
  if (!state.index) {
    root.append(h('div', { class: 'empty' }, 'Loading…'));
    return;
  }
  // Persistent game grid at top (selected one highlighted); the chosen game's details render below.
  root.append(gamesView());
  const game = state.selectedGameId ? (state.index.games[state.selectedGameId] ?? null) : null;
  const patch = selectedPatch();
  // Teaser takes precedence: a coming-soon/later game is never patchable, even if a patch exists.
  if (game && isComing(game)) root.append(comingSoonView(game));
  else if (game && patch) root.append(patchView(patch));
  root.append(footer());
  setupMedia();
}

export async function mount(el: HTMLElement) {
  root = el;
  render();
  try {
    const res = await fetch(url('patches.index.json'));
    if (!res.ok) throw new Error('index not found');
    state.index = (await res.json()) as PatchIndex;
  } catch {
    state.error = 'Unable to load the patch index (patches.index.json).';
  }
  render();
}
