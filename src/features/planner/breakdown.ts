// Turns a big, vague task into small concrete steps. Each step should take a few minutes and
// start with a verb, so it's obvious how to begin. Works offline from recognisable task shapes;
// Afina's language model refines it when available.

type Recipe = { match: RegExp; steps: (topic: string) => string[] };

const RECIPES_EN: Recipe[] = [
  { match: /\b(write|draft|blog|article|essay|report|post|case study|newsletter|proposal)\b/i, steps: (t) => [`Open a blank doc for “${t}”`, 'Jot down 3 points you want to make', 'Write a rough outline (headings only)', 'Draft the first section — ugly is fine', 'Draft the remaining sections', 'Read it once out loud and fix what trips you', 'Send or publish it'] },
  { match: /\b(clean|tidy|declutter|organi[sz]e)\b/i, steps: (t) => ['Set a 10-minute timer', 'Grab a bag for trash and a box for “elsewhere”', `Clear one surface for “${t}”`, 'Put away everything that has a home', 'Wipe down the cleared surfaces', 'Take the trash out'] },
  { match: /\b(email|reply|respond|message|text)\b/i, steps: (t) => [`Open the thread for “${t}”`, 'Decide the one thing your reply must say', 'Write two or three sentences', 'Send it'] },
  { match: /\b(call|phone|ring|book|appointment|schedule)\b/i, steps: (t) => ['Find the number or booking link', 'Write down what you need from the call', `Make the call: ${t}`, 'Add the outcome or date to your calendar'] },
  { match: /\b(study|learn|read|revise|course|exam|practice)\b/i, steps: (t) => [`Get your material for “${t}” in front of you`, 'Skim headings for 2 minutes', 'Focus on one section for 20 minutes', 'Write 3 things you learned', 'Plan the next session'] },
  { match: /\b(tax|taxes|budget|bill|invoice|pay|finance|expenses)\b/i, steps: (t) => ['Gather the documents or statements', `List what's needed for “${t}”`, 'Fill in the easy numbers first', 'Do the remaining ones, one at a time', 'Double-check totals', 'Submit or pay, then save the receipt'] },
  { match: /\b(prepare|prep|slides|presentation|talk|pitch|deck)\b/i, steps: (t) => [`Write the one-sentence point of “${t}”`, 'List 5 slide titles', 'Fill each slide with 1 idea', 'Add visuals or examples', 'Rehearse once with a timer'] },
  { match: /\b(move|moving|pack|packing|trip|travel)\b/i, steps: (t) => [`Make a checklist for “${t}”`, 'Do the bookings/confirmations first', 'Pack or prepare one category', 'Do the next category', 'Final walk-through'] },
  { match: /\b(fix|debug|bug|repair|troubleshoot)\b/i, steps: (t) => [`Reproduce the problem: ${t}`, 'Write down exactly what happens vs. what should', 'Check the most likely cause first', 'Make one change and test', 'Clean up and note what fixed it'] },
  { match: /\b(shop|shopping|groceries|buy)\b/i, steps: (t) => ['Check what you already have', `Write the list for “${t}”`, 'Group items by aisle or store', 'Go (or order online)', 'Put everything away'] },
  { match: /\b(workout|run|gym|exercise|train|yoga)\b/i, steps: () => ['Put on your workout clothes', 'Fill your water bottle', 'Warm up for 5 minutes', 'Do the main session', 'Stretch for 5 minutes'] },
  { match: /\b(plan|planning|organize my|roadmap|strategy)\b/i, steps: (t) => [`Write the goal of “${t}” in one line`, 'Brain-dump everything involved', 'Group it into 3–5 chunks', 'Put the chunks in order', 'Pick the first small action and schedule it'] },
];

const RECIPES_RU: Recipe[] = [
  { match: /(напис|черновик|стать|отчёт|отчет|пост|эссе|предложени)/i, steps: (t) => [`Открыть пустой документ для «${t}»`, 'Записать 3 главные мысли', 'Набросать план (только заголовки)', 'Написать первый раздел — можно криво', 'Дописать остальные разделы', 'Прочитать вслух и поправить', 'Отправить или опубликовать'] },
  { match: /(убра|уборк|прибра|разобрать|навести порядок)/i, steps: (t) => ['Поставить таймер на 10 минут', 'Взять пакет для мусора и коробку «не отсюда»', `Освободить одну поверхность: ${t}`, 'Разложить всё по местам', 'Протереть поверхности', 'Вынести мусор'] },
  { match: /(письм|ответ|написать .*сообщ)/i, steps: (t) => [`Открыть переписку: ${t}`, 'Решить, что главное нужно сказать', 'Написать 2–3 предложения', 'Отправить'] },
  { match: /(позвон|запис|созвон|забронир)/i, steps: (t) => ['Найти номер или ссылку для записи', 'Записать, что нужно выяснить', `Позвонить: ${t}`, 'Внести результат в календарь'] },
  { match: /(учи|изуч|прочит|экзамен|курс|повтор)/i, steps: (t) => [`Подготовить материалы: ${t}`, 'Пролистать заголовки 2 минуты', '20 минут на один раздел', 'Записать 3 вывода', 'Запланировать следующее занятие'] },
  { match: /(налог|бюджет|счёт|счет|оплат|финанс)/i, steps: (t) => ['Собрать документы', `Список того, что нужно для «${t}»`, 'Сначала заполнить простое', 'Остальное — по одному пункту', 'Проверить итоги', 'Отправить или оплатить, сохранить квитанцию'] },
  { match: /(тренир|пробеж|спорт|зал|йог)/i, steps: () => ['Переодеться в спортивное', 'Налить воды', 'Разминка 5 минут', 'Основная часть', 'Растяжка 5 минут'] },
];

/** Generic fallback: get started, do the work in chunks, wrap up. */
function generic(t: string, ru: boolean) {
  return ru
    ? [`Решить, как выглядит «готово» для «${t}»`, 'Подготовить всё, что нужно', 'Сделать первую маленькую часть (2 минуты)', 'Продолжить 20 минут', 'Проверить результат', 'Отметить задачу выполненной']
    : [`Decide what “done” looks like for “${t}”`, 'Get everything you need in front of you', 'Do the first tiny piece (2 minutes)', 'Keep going for 20 minutes', 'Check the result', 'Mark it done'];
}

export function breakDownTask(title: string): string[] {
  const ru = /[а-яё]/i.test(title);
  const topic = title.replace(/^(?:to\s+)?/i, '').trim();
  const recipe = (ru ? RECIPES_RU : RECIPES_EN).find((r) => r.match.test(title));
  return recipe ? recipe.steps(topic) : generic(topic, ru);
}
