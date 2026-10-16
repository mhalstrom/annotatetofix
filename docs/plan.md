# annotatetofix: plan

A browser add-on for Firefox and Chrome. You walk your own website, click each
element that has a problem, and write a note on it. One button gives you a prompt
that lists every open note with its exact element, ready to paste into a coding
agent. After the agent works, you walk the page again with the notes shown on
their elements, and you mark each note fixed or not fixed.

The add-on has no server, no account and no MCP. All data stays in the browser
until you copy a prompt or save a screenshot.

## Why

When you look at a page of your site, you see one problem, then another, then
another. It is easy to forget some of them, and it is hard to describe where each
one is. A note that points at the exact element, with a screenshot when the
problem is visual, gives the agent what it needs to find and fix each problem.

## Features

1. **Firefox and Chrome.** The owner uses Firefox; Chrome uses almost the same
   add-on format.
2. **Click an element to select it.** The note points at the exact element, so
   you do not describe where the problem is.
3. **A text box for each selected element.** You describe the problem while you
   look at it.
4. **Many notes on one page.** You record each problem at once and forget none.
5. **A "screenshot" checkbox on each note.** The agent sees the visual problem
   that you saw. The screenshot shows the element and a margin around it.
6. **A "Copy prompt" button, usable at any time.** It copies one prompt with
   every open note of the site. You decide when to send the work, and where.
7. **Links to the screenshots in the prompt.** The agent opens the picture of
   each note. The add-on saves the screenshots as files and the prompt names
   their paths.
8. **A site map with the date of the last fixed note of each page.** You see
   which pages you worked on and which pages nobody checked for a long time. The
   list holds each page that has a note. When the site has a `sitemap.xml`, the
   list also holds its pages, with "never checked" for a page with no note.
9. **Notes stay through a reload and a move to another page.** A reload or a
   wrong click deletes no note.
10. **Each note records the page address and the window size.** The agent opens
    the correct page at the width where the problem occurs.
11. **A numbered marker on each noted element.** You see what you already noted,
    so you do not note the same problem twice.
12. **A record of the notes of each page.** Every note stays, with its date, its
    screenshot and its state, also after you copy a prompt. You see what you
    asked for before, and you see when a problem comes back.
13. **A check mode.** After the agent works, open the page: the add-on shows the
    earlier notes on their elements. For each note you can mark it **fixed**, or
    mark it **not fixed** and add what is still wrong (the next prompt includes it
    again). You can add new notes in the same walk. The "fixed" marks give the
    dates of feature 8.
14. **Drag a box: a note on an area.** Some problems belong to no single
    element: a gap, a misalignment, a part made of several elements. In Add note
    mode, press and drag to draw a box; a plain click still selects one element.
    The note keeps the box (in page coordinates, with the window size), the
    smallest element that holds the whole box, and the main elements inside it.
    The marker and a dashed outline sit on the box, and the screenshot shows the
    box with a margin.

## The prompt

Markdown, one section for each page, one entry for each open note:

- the page address and the window size,
- the element: a selector that finds it, its tag, and the start of its text;
  for a note on an area, the size and place of the area, the element that holds
  it, and the elements in it,
- the note, and for a note marked not fixed, its earlier text and the new text,
- the path of the screenshot file, when the note has one.

The prompt opens with one line that tells the agent what the list is: problems
that the site owner found on these pages, to fix in the site's code.

## Technical choices

- One code base for both browsers, Manifest V3, built with WXT (a maintained
  framework for cross-browser add-ons) in TypeScript.
- The selector of an element: an `id` or a test attribute when the element has
  one, else a short CSS path that is unique on the page. The note also keeps the
  element's text, so the add-on can find the element again when the selector
  breaks, and it says so in check mode when it finds no element.
- Storage: `storage.local` for the notes, IndexedDB for the screenshot images.
- Screenshots: `tabs.captureVisibleTab`, cut to the element and its margin. The
  "Copy prompt" button also saves the screenshots of the open notes with the
  `downloads` API, in `Downloads/annotatetofix/<site>/`, so the paths in the
  prompt are real files.
- Permissions: only those the features need (`activeTab`, `storage`,
  `downloads`, `scripting`, and the host permission of a site when the user turns
  the add-on on for that site).

## Install

- Firefox, for a test: `about:debugging`, "Load Temporary Add-on". It stays until
  Firefox closes.
- Firefox, permanent: Mozilla signs the add-on for your own use ("unlisted"),
  with `web-ext sign`. This needs a free Mozilla add-ons account and its API key.
- Chrome: `chrome://extensions`, "Load unpacked" with developer mode on.

## Out of scope

A server, accounts, sharing notes between people, an MCP connection, and a
store listing.
