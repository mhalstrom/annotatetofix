// Styles of the add-on's own UI. They live in a shadow root, so the page's
// styles do not reach them and they do not reach the page.

export const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
.hover {
  position: fixed; pointer-events: none; display: none;
  outline: 2px solid #e5484d; background: rgba(229, 72, 77, 0.12); border-radius: 2px;
}
.marker {
  position: fixed; pointer-events: auto; cursor: pointer;
  min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px;
  background: #e5484d; color: #fff; font-weight: 700; font-size: 12px; line-height: 22px;
  text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.35); transform: translate(-40%, -60%);
}
.marker.missing { display: none; }
.panel {
  position: fixed; right: 16px; bottom: 16px; width: 320px; max-height: 70vh;
  display: flex; flex-direction: column; pointer-events: auto;
  background: #fff; color: #1c1c1c; border: 1px solid #d0d0d0; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.22); overflow: hidden;
}
.panel[hidden], .editor[hidden] { display: none; }
.head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #eee; }
.head strong { flex: 1; font-weight: 700; }
.actions { display: flex; gap: 6px; padding: 8px 10px; }
button {
  cursor: pointer; border: 1px solid #c8c8c8; background: #f6f6f6; color: #1c1c1c;
  border-radius: 6px; padding: 4px 9px;
}
button:hover { background: #ececec; }
button.primary { background: #e5484d; border-color: #e5484d; color: #fff; }
button.primary:hover { background: #d13c41; }
button.link { border: none; background: none; padding: 2px 4px; color: #555; text-decoration: underline; }
.status { padding: 0 10px 6px; color: #555; min-height: 0; }
.status:empty { display: none; }
.status.error { color: #c0262d; }
ol.notes { list-style: none; margin: 0; padding: 0 10px; overflow: auto; flex: 1; }
ol.notes li { display: flex; gap: 6px; align-items: baseline; padding: 6px 0; border-top: 1px solid #f0f0f0; }
ol.notes .num { font-weight: 700; color: #e5484d; min-width: 18px; }
ol.notes .text { flex: 1; white-space: pre-wrap; word-break: break-word; }
ol.notes .warn { color: #a15c00; font-size: 12px; }
.foot { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-top: 1px solid #eee; color: #555; }
textarea {
  width: 100%; min-height: 72px; resize: vertical; padding: 6px; border: 1px solid #c8c8c8; border-radius: 6px;
  color: #1c1c1c; background: #fff;
}
.copybox textarea { min-height: 120px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.copybox { padding: 0 10px 8px; }
.editor {
  position: fixed; width: 300px; pointer-events: auto; padding: 10px;
  background: #fff; color: #1c1c1c; border: 1px solid #d0d0d0; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.22);
}
.editor .target { color: #555; font-size: 12px; margin-bottom: 6px; word-break: break-all; }
.editor label { display: flex; gap: 6px; align-items: center; margin: 6px 0; }
.editor .row { display: flex; gap: 6px; justify-content: flex-end; }
.editor .row .spacer { flex: 1; }
`;
