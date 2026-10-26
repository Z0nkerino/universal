import { Mark, markInputRule, mergeAttributes } from '@tiptap/core';
import type { JSONContent } from '@tiptap/react';

/**
 * [[Note title]] links. Typing the closing ]] turns the text into a link mark; the
 * brackets are removed and the title is stored on the mark.
 */
export const WikiLink = Mark.create({
  name: 'wikilink',
  inclusive: false,
  addAttributes() {
    return { title: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span[data-wikilink]', getAttrs: (el) => ({ title: (el as HTMLElement).dataset.title ?? '' }) }];
  },
  renderHTML({ HTMLAttributes, mark }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-wikilink': '', 'data-title': mark.attrs.title, class: 'wikilink', role: 'link', tabindex: '0' }), 0];
  },
  addInputRules() {
    return [
      markInputRule({
        find: /\[\[([^\]]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => ({ title: match[1].trim() }),
      }),
    ];
  },
});

/** All [[titles]] referenced in a document. */
export function extractLinks(doc: JSONContent | null | undefined): string[] {
  const out = new Set<string>();
  const walk = (n: JSONContent) => {
    n.marks?.forEach((m) => m.type === 'wikilink' && m.attrs?.title && out.add(String(m.attrs.title)));
    n.content?.forEach(walk);
    // Unconverted [[text]] typed before the rule existed still counts.
    if (n.type === 'text' && n.text) for (const m of n.text.matchAll(/\[\[([^\]]+)\]\]/g)) out.add(m[1].trim());
  };
  if (doc) walk(doc);
  return [...out];
}
