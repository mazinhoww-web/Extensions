// MeetScribe — Keyboard Shortcuts Manager
// Configurable hotkeys saved to chrome.storage.sync under the 'shortcuts' key.
// Used in popup.js to trigger actions via keyboard.

export const DEFAULT_SHORTCUTS = {
  startStop: 'ctrl+shift+s',
  copyTranscript: 'ctrl+shift+c',
};

/**
 * Returns a normalized shortcut string from a KeyboardEvent.
 * e.g. "ctrl+shift+s", "alt+r"
 */
export function eventToShortcut(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const key = e.key.toLowerCase();
  if (!['control', 'meta', 'alt', 'shift'].includes(key)) parts.push(key);
  return parts.join('+');
}

/**
 * Load shortcuts from storage, falling back to defaults.
 */
export async function loadShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get('shortcuts');
  return { ...DEFAULT_SHORTCUTS, ...(shortcuts || {}) };
}

/**
 * Save shortcuts to storage.
 */
export async function saveShortcuts(shortcuts) {
  await chrome.storage.sync.set({ shortcuts });
}
