import { defineConfig } from 'wxt';

// One code base for Chrome and Firefox, Manifest V3 in both.
export default defineConfig({
  manifestVersion: 3,
  // A visible folder: the Mac file window of Firefox hides folders that start with a dot.
  outDir: 'dist',
  manifest: ({ browser }) => ({
    name: 'annotatetofix',
    description:
      'Note problems on the elements of your own website and copy one prompt for a coding agent.',
    permissions: ['activeTab', 'storage', 'downloads', 'scripting'],
    // A site is asked for only when you turn the add-on on for it.
    optional_host_permissions: ['<all_urls>'],
    action: { default_title: 'annotatetofix: show or hide the notes panel' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+A' },
        description: 'Show or hide the notes panel',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'annotatetofix@annotatetofix',
              strict_min_version: '128.0',
              // No data leaves the browser.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
  hooks: {
    // The content script is registered per site at run time, so the manifest
    // must not ask for every site at install time.
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.host_permissions;
    },
  },
});
