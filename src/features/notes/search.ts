import type { Note } from '@/lib/types';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export interface NoteHit {
  note: Note;
  score: number;
  /** Text around the first match, for the result list. */
  snippet: string;
}

/** Ranks notes by how well title, tags and body match every word of the query. */
export function searchNotes(notes: Note[], query: string): NoteHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: NoteHit[] = [];
  for (const note of notes) {
    const title = norm(note.title);
    const body = norm(note.text);
    const tags = note.tags.map(norm);
    let score = 0;
    let all = true;
    for (const w of words) {
      const inTitle = title.includes(w);
      const inTag = tags.some((t) => t.startsWith(w));
      const inBody = body.includes(w);
      if (!inTitle && !inTag && !inBody) {
        all = false;
        break;
      }
      score += (inTitle ? (title.startsWith(w) ? 12 : 8) : 0) + (inTag ? 5 : 0) + (inBody ? 2 + Math.min(3, body.split(w).length - 1) : 0);
    }
    if (!all) continue;
    if (note.pinned) score += 1;
    const i = body.indexOf(words[0]);
    const start = Math.max(0, i - 40);
    const snippet = i < 0 ? note.text.slice(0, 120) : (start ? '…' : '') + note.text.slice(start, start + 140).trim() + (start + 140 < note.text.length ? '…' : '');
    hits.push({ note, score, snippet });
  }
  return hits.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt);
}
