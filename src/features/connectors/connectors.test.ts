import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { addConnector, removeConnector, sendWebhook, useConnectors, type Connector } from './connectors';

const ics = (title: string) =>
  `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x1\r\nSUMMARY:${title}\r\nDTSTART:20991015T100000\r\nDTEND:20991015T110000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

afterEach(() => vi.unstubAllGlobals());

describe('calendar feed connector', () => {
  it('imports events as read-only, replaces them on sync and removes them with the connector', async () => {
    const fetch = vi.fn(async (_url: string) => new Response(ics('Board review'), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const c = await addConnector('calendar', 'Work', { provider: 'google', url: 'webcal://cal.example.com/a.ics', color: 'sky' });
    expect(fetch.mock.calls[0][0]).toBe('https://cal.example.com/a.ics');
    const events = await db.events.where('source').equals(`connector:${c.id}`).toArray();
    expect(events.map((e) => [e.title, e.color])).toEqual([['Board review', 'sky']]);
    expect(useConnectors.getState().list.find((x) => x.id === c.id)?.note).toMatch(/^1 /);
    await removeConnector(c.id);
    expect(await db.events.where('source').equals(`connector:${c.id}`).count()).toBe(0);
  });

  it('records a friendly error when the address isn’t a calendar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { status: 200 })));
    const c = await addConnector('calendar', 'Bad', { provider: 'ics', url: 'https://example.com/page', color: 'blue' });
    expect(useConnectors.getState().list.find((x) => x.id === c.id)?.lastError).toMatch(/didn’t return a calendar/);
  });
});

describe('webhooks', () => {
  const hook = (service: 'discord' | 'zapier') => ({ id: 'w', type: 'webhook', name: 'W', enabled: true, createdAt: 0, config: { url: 'https://hooks.example.com/x', service, events: ['task.completed'] } }) as Connector<'webhook'>;
  const event = { type: 'task.completed' as const, title: 'Ship 1.1', at: Date.UTC(2026, 9, 27) };

  it('formats messages for chat services and JSON for automation services', async () => {
    const fetch = vi.fn(async (_u: string, _init: RequestInit) => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await sendWebhook(hook('discord'), event)).toBe(true);
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({ content: 'Task completed: Ship 1.1' });
    await sendWebhook(hook('zapier'), event);
    expect(JSON.parse(String(fetch.mock.calls[1][1].body))).toMatchObject({ event: 'task.completed', title: 'Ship 1.1', app: 'Universal Planner', at: '2026-10-27T00:00:00.000Z' });
  });

  it('falls back to a no-cors send when the browser blocks the request', async () => {
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      if (init.mode !== 'no-cors') throw new TypeError('Failed to fetch');
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    expect(await sendWebhook(hook('zapier'), event)).toBe(false);
    expect(fetch.mock.calls[1][1]).toMatchObject({ mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } });
  });
});
