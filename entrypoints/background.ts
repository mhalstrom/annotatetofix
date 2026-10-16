import { errorText, type Rect, type Reply, type Request, type ToContent } from '@/utils/messages';
import { siteFolder } from '@/utils/note';
import { deleteShot, getShot, putShot } from '@/utils/shots';

const CONTENT_SCRIPT = 'content-scripts/content.js';
const SITES_KEY = 'sites';
/** CSS pixels around the element in a screenshot. */
const SHOT_MARGIN = 24;
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** A match pattern for the site of a page; patterns hold no port. */
function sitePattern(pageUrl: string): string | null {
  const url = new URL(pageUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return `${url.protocol}//${url.hostname}/*`;
}

function scriptId(pattern: string): string {
  return `site:${pattern}`;
}

async function enabledSites(): Promise<string[]> {
  const stored = await browser.storage.local.get(SITES_KEY);
  return (stored[SITES_KEY] as string[] | undefined) ?? [];
}

async function register(pattern: string): Promise<void> {
  const id = scriptId(pattern);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) return;
  await browser.scripting.registerContentScripts([
    { id, matches: [pattern], js: [CONTENT_SCRIPT], runAt: 'document_idle', persistAcrossSessions: true },
  ]);
}

async function enableSite(pattern: string): Promise<void> {
  const sites = await enabledSites();
  if (!sites.includes(pattern)) await browser.storage.local.set({ [SITES_KEY]: [...sites, pattern] });
  await register(pattern);
}

async function disableSite(pattern: string): Promise<void> {
  const sites = await enabledSites();
  await browser.storage.local.set({ [SITES_KEY]: sites.filter((s) => s !== pattern) });
  const id = scriptId(pattern);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) await browser.scripting.unregisterContentScripts({ ids: [id] });
  await browser.permissions.remove({ origins: [pattern] });
}

/** Registered scripts may not survive a restart (Firefox); register them again. */
async function restoreRegistrations(): Promise<void> {
  for (const pattern of await enabledSites()) {
    if (await browser.permissions.contains({ origins: [pattern] })) {
      await register(pattern).catch((e) => console.warn('annotatetofix: register', pattern, e));
    }
  }
}

async function onActionClicked(tab: { id?: number; url?: string }): Promise<void> {
  if (tab.id === undefined || !tab.url) return;
  const pattern = sitePattern(tab.url);
  if (!pattern) return;
  // The request must come first: the click is the user action that allows it.
  const granted = await browser.permissions.request({ origins: [pattern] });
  if (!granted) return;
  await enableSite(pattern);
  // The script guards against a second run, so this is safe when it is loaded already.
  await browser.scripting.executeScript({ target: { tabId: tab.id }, files: [`/${CONTENT_SCRIPT}`] });
  const message: ToContent = { type: 'toggle-panel' };
  await browser.tabs.sendMessage(tab.id, message);
}

async function capture(windowId: number, noteId: string, rect: Rect, viewportWidth: number): Promise<void> {
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = bitmap.width / viewportWidth;
  const left = Math.max(0, Math.floor((rect.x - SHOT_MARGIN) * scale));
  const top = Math.max(0, Math.floor((rect.y - SHOT_MARGIN) * scale));
  const right = Math.min(bitmap.width, Math.ceil((rect.x + rect.width + SHOT_MARGIN) * scale));
  const bottom = Math.min(bitmap.height, Math.ceil((rect.y + rect.height + SHOT_MARGIN) * scale));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas');
  context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
  bitmap.close();
  await putShot(noteId, await canvas.convertToBlob({ type: 'image/png' }));
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

/** Resolves with the absolute path of a download when it is complete. */
function finishedPath(downloadId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('the download did not finish in time')), DOWNLOAD_TIMEOUT_MS);
    const check = async () => {
      const [item] = await browser.downloads.search({ id: downloadId });
      if (item?.state === 'complete') done(null, item.filename);
      else if (item?.state === 'interrupted') done(new Error(`download failed: ${item.error ?? 'interrupted'}`));
    };
    const listener = (delta: { id: number }) => {
      if (delta.id === downloadId) void check();
    };
    function done(error: Error | null, path?: string) {
      clearTimeout(timer);
      browser.downloads.onChanged.removeListener(listener);
      if (error) reject(error);
      else resolve(path!);
    }
    browser.downloads.onChanged.addListener(listener);
    void check();
  });
}

async function saveShots(host: string, noteIds: string[]): Promise<Record<string, string>> {
  const paths: Record<string, string> = {};
  for (const noteId of noteIds) {
    const image = await getShot(noteId);
    if (!image) continue;
    // A Chrome service worker has no object URLs; Firefox does not download data URLs.
    const canUseObjectUrl = typeof URL.createObjectURL === 'function';
    const url = canUseObjectUrl ? URL.createObjectURL(image) : await blobToDataUrl(image);
    try {
      const downloadId = await browser.downloads.download({
        url,
        filename: `annotatetofix/${siteFolder(host)}/${noteId}.png`,
        conflictAction: 'overwrite',
        saveAs: false,
      });
      paths[noteId] = await finishedPath(downloadId);
    } finally {
      if (canUseObjectUrl) URL.revokeObjectURL(url);
    }
  }
  return paths;
}

async function handle(request: Request, sender: { tab?: { windowId?: number; url?: string } }): Promise<Reply> {
  switch (request.type) {
    case 'capture': {
      if (sender.tab?.windowId === undefined) return { ok: false, error: 'no tab' };
      await capture(sender.tab.windowId, request.noteId, request.rect, request.viewportWidth);
      return { ok: true };
    }
    case 'save-shots':
      return { ok: true, paths: await saveShots(request.host, request.noteIds) };
    case 'delete-shot':
      await deleteShot(request.noteId);
      return { ok: true };
    case 'get-shot': {
      const image = await getShot(request.noteId);
      return image ? { ok: true, image: await blobToDataUrl(image) } : { ok: false, error: 'no screenshot' };
    }
    case 'disable-site': {
      const pattern = sender.tab?.url ? sitePattern(sender.tab.url) : null;
      if (!pattern) return { ok: false, error: 'no site' };
      await disableSite(pattern);
      return { ok: true };
    }
  }
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    onActionClicked(tab).catch((e) => console.error('annotatetofix:', e));
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handle(message as Request, sender)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: errorText(e) } satisfies Reply));
    return true;
  });

  browser.runtime.onStartup.addListener(() => void restoreRegistrations());
  browser.runtime.onInstalled.addListener(() => void restoreRegistrations());
});
