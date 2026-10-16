import { errorText, type Reply, type Request, type ToContent } from '@/utils/messages';
import {
  editText,
  fixedNotes,
  historyOf,
  markFixed,
  markNotFixed,
  markSent,
  newId,
  notesKey,
  openNotes,
  pageUrl,
  type Note,
  type NoteEvent,
} from '@/utils/note';
import { buildPrompt, numberByPage } from '@/utils/prompt';
import { elementText, findElement, getSelector } from '@/utils/selector';
import { STYLE } from './style';

const FLAG = '__annotatetofix';
const RECHECK_MS = 700;

export default defineContentScript({
  // Never declared in the manifest: the background script registers it for
  // each site that you turn the add-on on for.
  registration: 'runtime',
  matches: ['<all_urls>'],
  main() {
    const scope = window as unknown as Record<string, boolean>;
    if (scope[FLAG]) return;
    scope[FLAG] = true;
    start();
  },
});

interface Marker {
  note: Note;
  number: number;
  el: Element | null;
  foundBy: string;
  badge: HTMLElement;
  item?: HTMLElement;
}

interface Editing {
  el: Element | null;
  note: Note | null;
  /** 'not-fixed' asks what is still wrong with an earlier note. */
  kind: 'note' | 'not-fixed';
}

const EVENT_WORDS: Record<NoteEvent['type'], string> = {
  created: 'noted',
  edited: 'edited',
  sent: 'sent',
  fixed: 'fixed',
  'not-fixed': 'not fixed',
};

function when(at: string): string {
  return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** One line with every step of a note, for example "noted Oct 16, 2:05 PM · sent Oct 16, 2:30 PM". */
function historyLine(note: Note): string {
  return historyOf(note)
    .map((e) => `${EVENT_WORDS[e.type]} ${when(e.at)}`)
    .join(' · ');
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}

function send(request: Request): Promise<Reply> {
  return (browser.runtime.sendMessage(request) as Promise<Reply>).catch(
    (e: unknown): Reply => ({ ok: false, error: errorText(e) }),
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function start(): void {
  const origin = location.origin;
  const panelKey = `panel:${origin}`;
  const checkKey = `check:${origin}`;
  let notes: Note[] = [];
  let panelOpen = false;
  let checking = false;
  /** Screenshot data URLs by note id, read once from the background script. */
  const shotCache = new Map<string, string>();
  let picking = false;
  let editing: Editing | null = null;
  let markers: Marker[] = [];
  let currentUrl = pageUrl(location.href);

  // The UI lives in a shadow root on the root element, out of the page's styles.
  const host = document.createElement('annotatetofix-ui');
  const shadow = host.attachShadow({ mode: 'open' });
  const layer = h('div', { className: 'layer' });
  const hover = h('div', { className: 'hover' });
  const markerLayer = h('div');

  const status = h('div', { className: 'status' });
  const list = h('ol', { className: 'notes' });
  const copyBox = h('div', { className: 'copybox', hidden: true });
  const addButton = h('button', { className: 'primary', type: 'button' }, 'Add note');
  const copyButton = h('button', { type: 'button' }, 'Copy prompt');
  const checkButton = h(
    'button',
    { type: 'button', title: 'Mark the earlier notes of this page fixed or not fixed' },
    'Check',
  );
  const hint = h(
    'div',
    { className: 'hint', hidden: true },
    'Check mode: mark each note Fixed or Not fixed. Add note still adds new notes.',
  );
  const closeButton = h('button', { className: 'link', type: 'button', title: 'Hide the panel and markers' }, 'Hide');
  const offButton = h('button', { className: 'link', type: 'button' }, 'Turn off on this site');
  const footText = h('span');
  const panel = h(
    'div',
    { className: 'panel', hidden: true },
    h('div', { className: 'head' }, h('strong', {}, 'annotatetofix'), closeButton),
    h('div', { className: 'actions' }, addButton, copyButton, checkButton),
    hint,
    status,
    copyBox,
    list,
    h('div', { className: 'foot' }, footText, offButton),
  );

  const editorTarget = h('div', { className: 'target' });
  const editorText = h('textarea', { placeholder: 'What is wrong here?' });
  const editorShot = h('input', { type: 'checkbox' });
  const editorShotLabel = h('span', {}, 'Screenshot of the element');
  const editorEarlier = h('div', { className: 'earlier', hidden: true });
  const deleteButton = h('button', { type: 'button' }, 'Delete');
  const cancelButton = h('button', { type: 'button' }, 'Cancel');
  const saveButton = h('button', { className: 'primary', type: 'button' }, 'Save');
  const editor = h(
    'div',
    { className: 'editor', hidden: true },
    editorTarget,
    editorEarlier,
    editorText,
    h('label', {}, editorShot, editorShotLabel),
    h('div', { className: 'row' }, deleteButton, h('span', { className: 'spacer' }), cancelButton, saveButton),
  );

  layer.append(hover, markerLayer, editor, panel);
  shadow.append(h('style', {}, STYLE), layer);
  document.documentElement.append(host);

  // Typing in a note must not trigger the page's keyboard shortcuts.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  function setStatus(text: string, error = false): void {
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  async function saveNotes(next: Note[]): Promise<void> {
    notes = next;
    await browser.storage.local.set({ [notesKey(origin)]: next });
    render();
  }

  // ---- Markers and the list --------------------------------------------

  function pageEntries() {
    return numberByPage(notes).get(currentUrl) ?? [];
  }

  function placeMarkers(refind: boolean): void {
    for (const marker of markers) {
      if (refind && (!marker.el || !marker.el.isConnected)) {
        const found = findElement(document, marker.note);
        marker.el = found.el;
        marker.foundBy = found.foundBy;
      }
      const rect = marker.el?.getBoundingClientRect();
      const visible = !!rect && (rect.width > 0 || rect.height > 0);
      marker.badge.classList.toggle('missing', !visible);
      if (rect && visible) {
        marker.badge.style.left = `${Math.max(0, rect.left)}px`;
        marker.badge.style.top = `${Math.max(0, rect.top)}px`;
      }
    }
    if (editing) placeEditor();
  }

  function render(): void {
    panel.hidden = !panelOpen;
    if (!panelOpen) stopPicking();

    markerLayer.replaceChildren();
    markers = [];
    if (panelOpen) {
      for (const { note, number } of pageEntries()) {
        const found = findElement(document, note);
        const badge = h('div', { className: 'marker', title: note.note }, String(number));
        badge.addEventListener('click', () => {
          const marker = markerFor(note.id);
          if (checking) flash(marker?.item);
          else openEditor(marker?.el ?? null, note);
        });
        markerLayer.append(badge);
        markers.push({ note, number, el: found.el, foundBy: found.foundBy, badge });
      }
      placeMarkers(false);
    }

    list.replaceChildren();
    for (const marker of markers) {
      const warning =
        marker.foundBy === 'missing'
          ? 'Element not found on the page.'
          : marker.foundBy === 'selector-text-changed'
            ? 'The element text changed.'
            : '';
      const buttons = checking ? checkButtons(marker) : editButtons(marker);
      const details: (Node | string)[] = [];
      if (checking && marker.note.state === 'not-fixed' && marker.note.previousNote) {
        details.push(h('div', { className: 'earlier' }, `Earlier: ${marker.note.previousNote}`));
      }
      details.push(marker.note.note + (marker.note.screenshot && !checking ? '  📷' : ''));
      if (warning) details.push(h('div', { className: 'warn' }, warning));
      if (checking) details.push(...recordOf(marker.note));
      marker.item = h(
        'li',
        {},
        h('span', { className: 'num' }, String(marker.number)),
        h('span', { className: 'text' }, ...details),
        ...buttons,
      );
      list.append(marker.item);
    }
    if (checking) renderFixed();

    hint.hidden = !checking;
    checkButton.classList.toggle('on', checking);
    checkButton.textContent = checking ? 'Done checking' : 'Check';

    const open = openNotes(notes);
    const elsewhere = open.filter((n) => n.url !== currentUrl).length;
    copyButton.textContent = `Copy prompt (${open.length})`;
    copyButton.disabled = open.length === 0;
    footText.textContent = elsewhere ? `${elsewhere} more on other pages` : '';
  }

  function markerFor(noteId: string): Marker | undefined {
    return markers.find((m) => m.note.id === noteId);
  }

  function editButtons(marker: Marker): HTMLElement[] {
    const edit = h('button', { className: 'link', type: 'button' }, 'Edit');
    edit.addEventListener('click', () => {
      marker.el?.scrollIntoView({ block: 'center' });
      openEditor(marker.el, marker.note);
    });
    const remove = h('button', { className: 'link', type: 'button' }, 'Delete');
    remove.addEventListener('click', () => void deleteNote(marker.note));
    return [edit, remove];
  }

  function checkButtons(marker: Marker): HTMLElement[] {
    const fixed = h('button', { className: 'small ok', type: 'button' }, 'Fixed');
    fixed.addEventListener('click', () => void setFixed(marker.note));
    const notFixed = h('button', { className: 'small', type: 'button' }, 'Not fixed');
    notFixed.addEventListener('click', () => {
      marker.el?.scrollIntoView({ block: 'center' });
      openEditor(marker.el, marker.note, 'not-fixed');
    });
    return [h('span', { className: 'pair' }, fixed, notFixed)];
  }

  /** The dates of a note and its screenshot, as the record shows them in check mode. */
  function recordOf(note: Note): HTMLElement[] {
    const parts: HTMLElement[] = [h('div', { className: 'hist' }, historyLine(note))];
    if (note.screenshot) parts.push(thumbnail(note.id));
    return parts;
  }

  function thumbnail(noteId: string): HTMLImageElement {
    const img = h('img', { className: 'thumb', alt: 'Screenshot of the element' });
    const cached = shotCache.get(noteId);
    if (cached) img.src = cached;
    else
      void send({ type: 'get-shot', noteId }).then((reply) => {
        if (reply.ok && reply.image) {
          shotCache.set(noteId, reply.image);
          img.src = reply.image;
        } else img.remove();
      });
    img.addEventListener('click', () => img.classList.toggle('large'));
    return img;
  }

  /** The fixed notes of this page, with a way to say that a problem came back. */
  function renderFixed(): void {
    const done = fixedNotes(notes, currentUrl);
    if (done.length === 0) return;
    list.append(h('li', { className: 'section' }, `Fixed on this page (${done.length})`));
    for (const note of done) {
      const again = h('button', { className: 'small', type: 'button', title: 'The problem came back' }, 'Not fixed');
      again.addEventListener('click', () => {
        const el = findElement(document, note).el;
        el?.scrollIntoView({ block: 'center' });
        openEditor(el, note, 'not-fixed');
      });
      list.append(
        h(
          'li',
          { className: 'done' },
          h('span', { className: 'num' }, '✓'),
          h('span', { className: 'text' }, note.note, ...recordOf(note)),
          again,
        ),
      );
    }
  }

  function flash(item: HTMLElement | undefined): void {
    if (!item) return;
    item.scrollIntoView({ block: 'nearest' });
    item.classList.remove('flash');
    void item.offsetWidth;
    item.classList.add('flash');
  }

  // ---- Selecting an element --------------------------------------------

  function isOurs(e: Event): boolean {
    return e.composedPath().includes(host);
  }

  function startPicking(): void {
    closeEditor();
    picking = true;
    addButton.textContent = 'Click an element… (Esc)';
    document.documentElement.style.cursor = 'crosshair';
  }

  function stopPicking(): void {
    if (!picking) return;
    picking = false;
    hover.style.display = 'none';
    addButton.textContent = 'Add note';
    document.documentElement.style.cursor = '';
  }

  function showHover(el: Element): void {
    const rect = el.getBoundingClientRect();
    Object.assign(hover.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  const block = (e: Event) => {
    if (!picking || isOurs(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick']) {
    window.addEventListener(type, block, true);
  }
  const onMove = (e: MouseEvent) => {
    if (picking && !isOurs(e) && e.target instanceof Element) showHover(e.target);
  };
  const onClick = (e: MouseEvent) => {
    if (!picking || isOurs(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const target = e.target instanceof Element ? e.target : null;
    stopPicking();
    if (target) openEditor(target, null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (editing) closeEditor();
    else if (picking) stopPicking();
  };
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  host.addEventListener('keydown', onKey);

  // ---- The note box ----------------------------------------------------

  function openEditor(el: Element | null, note: Note | null, kind: Editing['kind'] = 'note'): void {
    stopPicking();
    editing = { el, note, kind };
    const tag = note?.tag ?? el?.tagName.toLowerCase() ?? '?';
    const text = note?.text ?? (el ? elementText(el) : '');
    editorTarget.textContent = `<${tag}>${text ? ` "${text}"` : ''}`;
    const notFixed = kind === 'not-fixed';
    editorEarlier.hidden = !notFixed;
    editorEarlier.textContent = notFixed && note ? `Earlier: ${note.note}` : '';
    editorText.placeholder = notFixed ? 'What is still wrong?' : 'What is wrong here?';
    editorText.value = notFixed ? '' : (note?.note ?? '');
    editorShotLabel.textContent = notFixed && note?.screenshot ? 'New screenshot of the element' : 'Screenshot of the element';
    editorShot.checked = notFixed ? false : (note?.screenshot ?? false);
    editorShot.disabled = notFixed && !el;
    deleteButton.hidden = !note || notFixed;
    editor.hidden = false;
    placeEditor();
    editorText.focus();
  }

  function closeEditor(): void {
    editing = null;
    editor.hidden = true;
    hover.style.display = 'none';
  }

  function placeEditor(): void {
    const width = 300;
    const height = editor.offsetHeight || 190;
    const rect = editing?.el?.isConnected ? editing.el.getBoundingClientRect() : null;
    let left = rect ? rect.left : (innerWidth - width) / 2;
    let top = rect ? rect.bottom + 8 : (innerHeight - height) / 2;
    if (rect && top + height > innerHeight) top = rect.top - height - 8;
    left = Math.min(Math.max(8, left), innerWidth - width - 8);
    top = Math.min(Math.max(8, top), innerHeight - height - 8);
    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;
    if (rect) showHover(editing!.el!);
  }

  async function takeShot(noteId: string, el: Element): Promise<boolean> {
    // The add-on's own UI must not be in the picture.
    host.style.visibility = 'hidden';
    await nextFrame();
    await nextFrame();
    const rect = el.getBoundingClientRect();
    const reply = await send({
      type: 'capture',
      noteId,
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      viewportWidth: innerWidth,
    });
    host.style.visibility = '';
    if (!reply.ok) {
      setStatus(
        `No screenshot (${reply.error}). Click the annotatetofix button in the toolbar on this page, then edit the note and save it with Screenshot ticked.`,
        true,
      );
    }
    return reply.ok;
  }

  async function saveEditor(): Promise<void> {
    if (!editing) return;
    const text = editorText.value.trim();
    if (!text) {
      editorText.focus();
      return;
    }
    const { el, note, kind } = editing;
    const wantShot = editorShot.checked;
    closeEditor();
    setStatus('');
    const now = new Date().toISOString();

    if (note && kind === 'not-fixed') {
      // An earlier screenshot stays in the record unless a new one replaces it.
      const updated = markNotFixed(note, text, now);
      if (wantShot && el && (await takeShot(note.id, el))) {
        updated.screenshot = true;
        shotCache.delete(note.id);
      }
      await saveNotes(notes.map((n) => (n.id === note.id ? updated : n)));
      return;
    }
    if (note) {
      const updated: Note = { ...editText(note, text, now), screenshot: note.screenshot && wantShot };
      if (wantShot && !note.screenshot && el) updated.screenshot = await takeShot(note.id, el);
      if (!wantShot && note.screenshot) {
        await send({ type: 'delete-shot', noteId: note.id });
        shotCache.delete(note.id);
      }
      await saveNotes(notes.map((n) => (n.id === note.id ? updated : n)));
      return;
    }
    if (!el) return;
    const created: Note = {
      id: newId(),
      url: currentUrl,
      viewport: { width: innerWidth, height: innerHeight },
      selector: getSelector(el),
      tag: el.tagName.toLowerCase(),
      text: elementText(el),
      note: text,
      screenshot: false,
      state: 'open',
      created: now,
      history: [{ type: 'created', at: now, text }],
    };
    if (wantShot) created.screenshot = await takeShot(created.id, el);
    await saveNotes([...notes, created]);
  }

  async function deleteNote(note: Note): Promise<void> {
    if (note.screenshot) await send({ type: 'delete-shot', noteId: note.id });
    shotCache.delete(note.id);
    await saveNotes(notes.filter((n) => n.id !== note.id));
  }

  async function setFixed(note: Note): Promise<void> {
    const updated = markFixed(note, new Date().toISOString());
    await saveNotes(notes.map((n) => (n.id === note.id ? updated : n)));
  }

  saveButton.addEventListener('click', () => void saveEditor());
  cancelButton.addEventListener('click', closeEditor);
  deleteButton.addEventListener('click', () => {
    const note = editing?.note;
    closeEditor();
    if (note) void deleteNote(note);
  });
  editorText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveEditor();
  });

  // ---- Copy prompt -----------------------------------------------------

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = h('textarea', { value: text });
      copyBox.replaceChildren(area);
      copyBox.hidden = false;
      area.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      if (copied) copyBox.hidden = true;
      return copied;
    }
  }

  async function copyPrompt(): Promise<void> {
    const open = openNotes(notes);
    if (open.length === 0) return;
    copyBox.hidden = true;
    let paths: Record<string, string> = {};
    const withShots = open.filter((n) => n.screenshot).map((n) => n.id);
    if (withShots.length > 0) {
      setStatus('Saving screenshots…');
      const reply = await send({ type: 'save-shots', host: location.host, noteIds: withShots });
      if (reply.ok) paths = reply.paths ?? {};
      else setStatus(`Screenshots not saved (${reply.error}).`, true);
    }
    const text = buildPrompt(notes, paths);
    const pages = numberByPage(notes).size;
    const copied = await copyText(text);
    // The record says when each note went out; the text box counts too, as its text is ready to copy.
    await saveNotes(markSent(notes, open.map((n) => n.id), new Date().toISOString()));
    if (copied) {
      const shots = Object.keys(paths).length;
      setStatus(
        `Copied: ${open.length} note${open.length === 1 ? '' : 's'} on ${pages} page${pages === 1 ? '' : 's'}` +
          (shots ? `, ${shots} screenshot${shots === 1 ? '' : 's'} in Downloads/annotatetofix.` : '.'),
      );
    } else {
      setStatus('Select the text below and copy it (Ctrl+C or ⌘C).', true);
    }
  }

  addButton.addEventListener('click', () => (picking ? stopPicking() : startPicking()));
  copyButton.addEventListener('click', () => void copyPrompt());
  checkButton.addEventListener('click', () => void setChecking(!checking));
  closeButton.addEventListener('click', () => void setPanel(false));
  offButton.addEventListener('click', () => void turnOff());

  // ---- Panel state, page changes, teardown -----------------------------

  async function setPanel(open: boolean): Promise<void> {
    panelOpen = open;
    if (!open) closeEditor();
    await browser.storage.local.set({ [panelKey]: open });
    render();
  }

  /** Check mode stays on through a reload and on the other pages of the site. */
  async function setChecking(on: boolean): Promise<void> {
    checking = on;
    closeEditor();
    await browser.storage.local.set({ [checkKey]: on });
    render();
  }

  const onScroll = () => placeMarkers(false);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);

  // Pages that change the address without a reload, and elements that render late.
  const timer = setInterval(() => {
    const url = pageUrl(location.href);
    if (url !== currentUrl) {
      currentUrl = url;
      closeEditor();
      stopPicking();
      render();
    } else if (panelOpen) {
      placeMarkers(true);
    }
  }, RECHECK_MS);

  const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[notesKey(origin)];
    if (area !== 'local' || !change) return;
    notes = (change.newValue as Note[] | undefined) ?? [];
    render();
  };
  browser.storage.onChanged.addListener(onStorage);

  const ready = browser.storage.local.get([notesKey(origin), panelKey, checkKey]).then((stored) => {
    notes = (stored[notesKey(origin)] as Note[] | undefined) ?? [];
    panelOpen = stored[panelKey] === true;
    checking = stored[checkKey] === true;
    render();
  });

  const onMessage = (message: unknown) => {
    if ((message as ToContent)?.type === 'toggle-panel') void ready.then(() => setPanel(!panelOpen));
  };
  browser.runtime.onMessage.addListener(onMessage);

  async function turnOff(): Promise<void> {
    const reply = await send({ type: 'disable-site' });
    if (!reply.ok) {
      setStatus(`Not turned off (${reply.error}).`, true);
      return;
    }
    await browser.storage.local.set({ [panelKey]: false });
    clearInterval(timer);
    stopPicking();
    for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick']) {
      window.removeEventListener(type, block, true);
    }
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    browser.storage.onChanged.removeListener(onStorage);
    browser.runtime.onMessage.removeListener(onMessage);
    host.remove();
    (window as unknown as Record<string, boolean>)[FLAG] = false;
  }
}
