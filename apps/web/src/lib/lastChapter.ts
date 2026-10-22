// Remembers the last chapter opened on this device, for "continue" on home.
const KEY = "nt:last-chapter";

export function rememberChapter(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // private mode / storage blocked: home just falls back to the first chapter
  }
}

export function lastChapter(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
