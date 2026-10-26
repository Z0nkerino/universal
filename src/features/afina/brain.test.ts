import { beforeAll, describe, expect, it, vi } from 'vitest';

let next = '';
vi.mock('./llm', () => ({ llmReady: () => true, complete: vi.fn(async () => next) }));

import { db } from '@/lib/db';
import { seedDemoData } from '@/lib/demo';
import { todayKey } from '@/lib/dates';
import { buildContext, think } from './brain';
import { complete } from './llm';

describe('Afina brain with the language model', () => {
  beforeAll(async () => {
    await seedDemoData();
  });

  it('uses the engine first without calling the model', async () => {
    vi.mocked(complete).mockClear();
    const r = await think('plan my day', []);
    expect(r.handled).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  });

  it('executes a model tool call through the engine', async () => {
    next = '{"tool":"log_food","args":{"items":"2 eggs and a latte","meal":"breakfast"},"reply":"Logged!"}';
    const before = await db.meals.where('date').equals(todayKey()).count();
    const r = await think('so for my first meal there were a couple of eggs plus a latte', []);
    expect(await db.meals.where('date').equals(todayKey()).count()).toBe(before + 2);
    expect(r.text).toMatch(/Egg \(boiled\)/);
  });

  it('uses model-written steps for break_down', async () => {
    next = '{"tool":"break_down","args":{"task":"Clean the garage","steps":["Open the garage door","Sort one shelf","Bag trash"]},"reply":"Here you go:"}';
    const r = await think('the garage is a disaster, help me get going on it', []);
    expect(r.text).toMatch(/• Sort one shelf/);
    const t = (await db.tasks.orderBy('createdAt').last())!;
    expect(t.subtasks.map((s) => s.title)).toEqual(['Open the garage door', 'Sort one shelf', 'Bag trash']);
  });

  it('answers in plain text and survives bad output', async () => {
    next = '{"tool":"none","reply":"Rest is productive too."}';
    expect((await think('is it okay that I rest?', [])).text).toBe('Rest is productive too.');
    next = 'Not JSON at all';
    expect((await think('tell me something nice', [])).text).toBe('Not JSON at all');
  });

  it('builds a grounded context', async () => {
    const ctx = await buildContext('portfolio case study');
    expect(ctx).toMatch(/Open tasks/);
    expect(ctx).toMatch(/Note “Portfolio site plan”/);
    expect(ctx).toMatch(/Goals: /);
  });
});
