# annotatetofix

A browser add-on for Firefox and Chrome. Walk your own website, click each
element that has a problem, and write a note on it. One button copies a prompt
that lists every open note with its exact element, ready to paste into a coding
agent. No server, no account: the notes stay in your browser.

The plan, with the reason for each feature: [docs/plan.md](docs/plan.md).

## Build

Needs Node.js 20 or later.

```sh
npm install
npm run build      # both browsers: dist/chrome-mv3 and dist/firefox-mv3
npm test           # unit tests of the selector, the prompt text and the note record
```

`npm run dev` (Chrome) and `npm run dev:firefox` start a browser with the
add-on loaded and rebuild it when a file changes.

## Load it in the browser

**Firefox** (128 or later), for a test:

1. Run `npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `dist/firefox-mv3/manifest.json`.

A temporary add-on stays until Firefox closes. For a permanent install, Mozilla
signs the add-on for your own use with `web-ext sign` (see docs/plan.md).

**Chrome**:

1. Run `npm run build`.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder `dist/chrome-mv3`.

## Use it

1. Open a page of your site and click the annotatetofix button in the toolbar
   (or press Alt+Shift+A). The first time on a site, the browser asks for
   access to that site. The notes panel opens at the bottom right.
2. Click **Add note**, then click the element that has the problem. Links and
   buttons do not react while you select. Press Esc to stop.
3. Write what is wrong. Tick **Screenshot of the element** when the problem is
   visual. Save (or press Ctrl+Enter / ⌘Enter).
4. Each note gets a numbered marker on its element. Click a marker or **Edit**
   to change a note. The notes stay through a reload and on other pages of
   the site.
5. Click **Copy prompt** when you want the work done. The prompt holds every
   open note of the site, grouped by page, with the window size, the element
   and the note. The screenshots go to `Downloads/annotatetofix/<site>/`, and
   the prompt names each file.
6. Paste the prompt into your coding agent.

### Check the work

After the agent works, open the page again and click **Check**. The panel
shows the notes of the page on their elements, each with the date it was made
and the dates it went out in a prompt, and its screenshot. For each note:

- **Fixed**: the note leaves the next prompt. It stays in the list under
  **Fixed on this page**, with the date.
- **Not fixed**: write what is still wrong (tick the box for a new
  screenshot). The next prompt holds the note again, with the earlier text and
  the new text.

When a fixed problem comes back, click **Not fixed** on it under **Fixed on
this page**. **Add note** still adds new notes while you check. When an
element is gone from the page, its note says so. Check mode stays on through a
reload and on the other pages of the site; **Done checking** ends it.

**Hide** closes the panel and the markers until the next click on the toolbar
button. **Turn off on this site** removes the add-on's access to the site; the
notes stay.

### Screenshots

The browser lets an add-on capture a tab only after you click its toolbar
button (or press its shortcut) on that page. After a reload or a move to
another page, click the button once before you save a note with a screenshot.
When a screenshot fails, the panel says so and the note is kept without one.

## Permissions

- `activeTab`: capture the visible tab for a screenshot, after your click.
- `storage`: keep the notes.
- `downloads`: save the screenshots as files that the prompt can name.
- `scripting`: show the panel and the markers on the sites you turned on.
- Access to a site only when you turn the add-on on for it.
