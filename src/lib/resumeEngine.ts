/**
 * Resume Engine — Exact reading position persistence
 * Hybrid: localStorage first, syncs to DB for logged-in users.
 * Throttled saves, paragraph-anchor preference over raw scroll.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ResumeState {
  bookId: string;
  chapterNumber: number;
  sectionIndex: number;
  lastParagraphAnchor: string | null; // data-paragraph-id or heading text
  scrollOffset: number;
  readingMode: string; // 'default' | 'guided' | 'audio'
  audioChunkIndex: number | null;
  audioVoice: string | null;
  readingTheme: string;
  fontSize: number;
  updatedAt: number;
}

const STORAGE_KEY = 'scroll_resume_state';
const THROTTLE_MS = 3_000; // Save at most every 3s
const DB_SYNC_MS = 15_000; // Sync to DB every 15s

let _lastSaveTime = 0;
let _pendingSave: ResumeState | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _dbSyncTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Local persistence ───

function loadAllLocal(): Record<string, ResumeState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAllLocal(data: Record<string, ResumeState>) {
  try {
    // Keep only last 30 entries
    const entries = Object.entries(data).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, 30);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* noop */ }
}

function getKey(bookId: string, chapterNumber: number): string {
  return `${bookId}:${chapterNumber}`;
}

// ─── Public API ───

export function saveResumeState(state: ResumeState): void {
  const now = Date.now();
  state.updatedAt = now;

  // Throttle: if called too soon, queue and debounce
  if (now - _lastSaveTime < THROTTLE_MS) {
    _pendingSave = state;
    if (!_saveTimer) {
      _saveTimer = setTimeout(() => {
        _saveTimer = null;
        if (_pendingSave) {
          commitSave(_pendingSave);
          _pendingSave = null;
        }
      }, THROTTLE_MS);
    }
    return;
  }

  commitSave(state);
}

function commitSave(state: ResumeState): void {
  _lastSaveTime = Date.now();
  const all = loadAllLocal();
  const key = getKey(state.bookId, state.chapterNumber);
  all[key] = state;
  saveAllLocal(all);

  // Schedule DB sync (debounced)
  scheduleDatabaseSync(state);
}

export function getResumeState(bookId: string, chapterNumber: number): ResumeState | null {
  const all = loadAllLocal();
  return all[getKey(bookId, chapterNumber)] || null;
}

export function getLatestResumeForBook(bookId: string): ResumeState | null {
  const all = loadAllLocal();
  let latest: ResumeState | null = null;
  for (const state of Object.values(all)) {
    if (state.bookId === bookId) {
      if (!latest || state.updatedAt > latest.updatedAt) {
        latest = state;
      }
    }
  }
  return latest;
}

export function clearResumeState(bookId: string, chapterNumber: number): void {
  const all = loadAllLocal();
  delete all[getKey(bookId, chapterNumber)];
  saveAllLocal(all);
}

// ─── Paragraph anchor utilities ───

/** Find the nearest visible paragraph and return its anchor ID */
export function findCurrentParagraphAnchor(contentRef: HTMLElement | null): string | null {
  if (!contentRef) return null;

  const paragraphs = contentRef.querySelectorAll('[data-paragraph-id], h2, h3, p');
  const viewportMid = window.innerHeight / 2;

  let bestEl: Element | null = null;
  let bestDist = Infinity;

  paragraphs.forEach(el => {
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top - viewportMid);
    if (dist < bestDist) {
      bestDist = dist;
      bestEl = el;
    }
  });

  if (!bestEl) return null;

  // Prefer data-paragraph-id, fallback to textContent hash
  const pid = (bestEl as HTMLElement).getAttribute('data-paragraph-id');
  if (pid) return pid;

  const text = (bestEl as HTMLElement).textContent?.trim().slice(0, 80) || null;
  return text ? `text:${text}` : null;
}

/** Scroll to a paragraph anchor. Returns true if found. */
export function scrollToAnchor(contentRef: HTMLElement | null, anchor: string): boolean {
  if (!contentRef || !anchor) return false;

  // Try data-paragraph-id first
  if (!anchor.startsWith('text:')) {
    const el = contentRef.querySelector(`[data-paragraph-id="${anchor}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      return true;
    }
  }

  // Fallback: match by text prefix
  const searchText = anchor.startsWith('text:') ? anchor.slice(5) : anchor;
  const elements = contentRef.querySelectorAll('h2, h3, p');
  for (const el of elements) {
    const text = (el as HTMLElement).textContent?.trim() || '';
    if (text.startsWith(searchText.slice(0, 60))) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      return true;
    }
  }

  return false;
}

/** Restore reading position: anchor-first, scroll fallback */
export function restorePosition(
  contentRef: HTMLElement | null,
  state: ResumeState
): boolean {
  if (!contentRef) return false;

  // 1. Try paragraph anchor
  if (state.lastParagraphAnchor) {
    const found = scrollToAnchor(contentRef, state.lastParagraphAnchor);
    if (found) return true;
  }

  // 2. Fallback to scroll offset
  if (state.scrollOffset > 0) {
    window.scrollTo({ top: state.scrollOffset, behavior: 'instant' });
    return true;
  }

  return false;
}

// ─── Database sync (logged-in users) ───

function scheduleDatabaseSync(state: ResumeState): void {
  if (_dbSyncTimer) clearTimeout(_dbSyncTimer);
  _dbSyncTimer = setTimeout(() => {
    syncToDatabase(state);
  }, DB_SYNC_MS);
}

async function syncToDatabase(state: ResumeState): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('pmf_events' as any).insert({
      user_id: user.id,
      event_type: 'resume_state_sync',
      metadata: {
        bookId: state.bookId,
        chapterNumber: state.chapterNumber,
        sectionIndex: state.sectionIndex,
        lastParagraphAnchor: state.lastParagraphAnchor,
        scrollOffset: state.scrollOffset,
        readingMode: state.readingMode,
        audioChunkIndex: state.audioChunkIndex,
        audioVoice: state.audioVoice,
        updatedAt: state.updatedAt,
      },
    });
  } catch { /* silent */ }
}

/** Load resume state from DB (for login sync) */
export async function loadResumeFromDatabase(bookId: string): Promise<ResumeState | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from('pmf_events' as any)
      .select('metadata, created_at')
      .eq('user_id', user.id)
      .eq('event_type', 'resume_state_sync')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!data || data.length === 0) return null;

    // Find latest for this book
    for (const row of data) {
      const meta = row.metadata as any;
      if (meta?.bookId === bookId) {
        return {
          bookId: meta.bookId,
          chapterNumber: meta.chapterNumber,
          sectionIndex: meta.sectionIndex ?? 0,
          lastParagraphAnchor: meta.lastParagraphAnchor ?? null,
          scrollOffset: meta.scrollOffset ?? 0,
          readingMode: meta.readingMode ?? 'default',
          audioChunkIndex: meta.audioChunkIndex ?? null,
          audioVoice: meta.audioVoice ?? null,
          readingTheme: 'default',
          fontSize: 18,
          updatedAt: meta.updatedAt ?? Date.now(),
        };
      }
    }
  } catch { /* silent */ }
  return null;
}

/** Flush any pending state immediately (call on unmount) */
export function flushResumeState(): void {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  if (_pendingSave) {
    commitSave(_pendingSave);
    _pendingSave = null;
  }
}
