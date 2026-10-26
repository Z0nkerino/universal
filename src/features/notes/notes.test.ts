import { describe, expect, it } from 'vitest';
import { searchNotes } from './search';
import { extractLinks } from './wikilink';
import type { Note } from '@/lib/types';

const n = (title: string, text: string, extra: Partial<Note> = {}): Note => ({ id: title, title, text, content: null, folder: 'Notes', tags: [], pinned: 0, links: [], createdAt: 0, updatedAt: 0, ...extra });

describe('notes', () => {
  it('ranks title matches above body matches and requires every word', () => {
    const notes = [n('Grocery list', 'milk eggs bread'), n('Portfolio plan', 'publish the grocery app case study'), n('Ёлка', 'новый год')];
    expect(searchNotes(notes, 'grocery').map((h) => h.note.title)).toEqual(['Grocery list', 'Portfolio plan']);
    expect(searchNotes(notes, 'grocery case').map((h) => h.note.title)).toEqual(['Portfolio plan']);
    expect(searchNotes(notes, 'елка')[0].note.title).toBe('Ёлка');
  });
  it('extracts [[links]] from marks and raw text', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'text', text: 'Plan', marks: [{ type: 'wikilink', attrs: { title: 'Plan' } }] }, { type: 'text', text: ' and [[Ideas]]' }] }] };
    expect(extractLinks(doc).sort()).toEqual(['Ideas', 'Plan']);
  });
});

describe('idea links', () => {
  it('anchors to the facing edges', async () => {
    const { linkPath } = await import('@/features/ideas/geometry');
    const side = linkPath({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 });
    expect(side.d.startsWith('M 100 25')).toBe(true);
    expect(side.d.endsWith('300 25')).toBe(true);
    const stacked = linkPath({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 200, w: 100, h: 60 });
    expect(stacked.d.startsWith('M 50 50')).toBe(true);
    expect(stacked.d.endsWith('50 200')).toBe(true);
  });
});
