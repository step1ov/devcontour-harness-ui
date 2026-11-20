// Every UI string of the panel, in Russian (first-class) and English. One
// dictionary: components never write a visible word of their own.
// tests/i18n.test.ts checks that both languages have every key with the same
// kind of value (text or a function of the same arity).
//
// Rules the wording follows (docs/design.md §5.9):
// - "checked" is never written without how and by whom;
// - "accepted" never without where (locally; on the remote: yes, no or unknown);
// - "waiting" or "stopped" never without the reason and who acts;
// - an unknown value is "unknown" or "not checked", never 0, "no" or OK.
// Pure: no node:*, no React.

/** Russian plural form: 1 вопрос, 2 вопроса, 5 вопросов. */
export function ruPlural(n: number, forms: readonly [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

const rp = (n: number, one: string, few: string, many: string) =>
  `${n} ${ruPlural(n, [one, few, many])}`;
const ep = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Glossary entries (design §12): the "what it means" disclosures. */
export type GlossaryId =
  | 'lead'
  | 'writer'
  | 'review'
  | 'gates'
  | 'stage'
  | 'recheck'
  | 'attempt'
  | 'neutral'
  | 'integration'
  | 'accepted'
  | 'drift'
  | 'escalation'
  | 'temporary'
  | 'technical'
  | 'lowerBound'
  | 'unknown'
  | 'controller'
  | 'stalled'
  | 'waitsQueue'
  | 'decision'
  | 'waitsWork'
  | 'answerBasis'
  | 'failureBucket'
  | 'reviewRound'
  | 'wallTime'
  | 'attemptTime'
  | 'loadPeak'
  | 'windowSpend'
  | 'typical'
  | 'operator'
  | 'host'
  | 'remote';

const ruGlossary: Record<GlossaryId, { term: string; meaning: string }> = {
  lead: {
    term: 'ведущий',
    meaning:
      'Агент, который ведёт проект от вашего имени: запускает harness, читает результаты, отвечает на вопросы, которые ему разрешены.',
  },
  writer: {
    term: 'исполнитель',
    meaning: 'Агент, который пишет код одной работы в отдельной копии репозитория.',
  },
  review: {
    term: 'ревью',
    meaning:
      'Другой агент читает план или изменения и пишет замечания. Ревью кода читает diff и ничего не запускает, если это не сказано отдельно.',
  },
  gates: {
    term: 'проверки (gates)',
    meaning:
      'Команды проекта (тесты, lint, сборка), которые harness запускает над изменением. Результат пишется вместе со способом: запущено, взято прежнее, не проверялось.',
  },
  stage: {
    term: 'этап',
    meaning:
      'Шаг, на котором сейчас работа: очередь, подготовка, написание, проверки, ревью, интеграция, ожидание ответа.',
  },
  recheck: {
    term: 'перепроверка',
    meaning:
      'Повторный запуск проверки на той же попытке, чтобы отличить настоящую ошибку от случайной.',
  },
  attempt: {
    term: 'попытка',
    meaning:
      'Один заход исполнителя над работой. У работы ограниченное число попыток; прерывание при остановке попытку не расходует.',
  },
  neutral: {
    term: 'нейтральный сбой',
    meaning:
      'Сбой не по вине кода (например, окружение), который не расходует попытку, но имеет свой предел.',
  },
  integration: {
    term: 'интеграция',
    meaning: 'Перенос принятого изменения в целевую ветку с проверками на результате.',
  },
  accepted: {
    term: 'принято',
    meaning:
      'Работа прошла проверки и ревью, и harness записал результат в целевую ветку локально. «В удалённом репозитории» — отдельный факт: туда результат отправляет человек или ведущий по вашей просьбе.',
  },
  drift: {
    term: 'дрейф',
    meaning: 'Целевая ветка изменилась после приёмки, и принятый результат стоит не на её вершине.',
  },
  escalation: {
    term: 'эскалация',
    meaning:
      'Блокирующее замечание не решилось за несколько раундов ревью, и решение переходит к вам.',
  },
  temporary: {
    term: 'временное решение',
    meaning: 'Решение «пока так», с условием, когда к нему вернуться.',
  },
  technical: {
    term: 'технический вопрос',
    meaning:
      'Вопрос, ответ на который не меняет результат для пользователя. Его может решать ведущий, если это включено в настройках.',
  },
  lowerBound: {
    term: 'нижняя граница (≥)',
    meaning:
      'Часть цен неизвестна, поэтому показанная сумма — минимум, настоящая может быть больше.',
  },
  unknown: {
    term: 'неизвестно, не проверено',
    meaning: 'У harness нет сведений. Это не ноль и не «в порядке».',
  },
  controller: {
    term: 'контроллер',
    meaning: 'Процесс harness, который сейчас ведёт очередь. Без него работа не продвигается.',
  },
  stalled: {
    term: 'зависшая / тихая попытка',
    meaning: 'Попытка давно не подавала признаков жизни (тихая) или дольше порога (зависшая).',
  },
  waitsQueue: {
    term: 'ждёт очереди',
    meaning:
      'Работа ждёт свободного места или окончания работ, от которых зависит. Ничего делать не нужно.',
  },
  decision: {
    term: 'решение',
    meaning:
      'harness остановил работу и сам её не продолжит: нужен человек или ведущий — сбросить попытки, согласовать план заново, увеличить бюджет и т. п. Это не вопрос: вопрос задаёт исполнитель, и в ответе нужно содержание, а решение — разрешение продолжать.',
  },
  waitsWork: {
    term: 'ждёт другой работы',
    meaning:
      'Работа зависит от другой и начнётся, когда та будет принята. С ней самой делать ничего не нужно — действовать нужно по той работе, кто там указан.',
  },
  answerBasis: {
    term: 'кто и почему ответил',
    meaning:
      'Кто дал последний ответ на вопрос исполнителя: вы, ведущий или хост. Ведущий отвечает только по правилу из настроек — на технический вопрос или на вопрос ниже порога важности — и записывает причину; её показывает harness.',
  },
  failureBucket: {
    term: 'причина неудачи',
    meaning:
      'Группа, к которой harness отнёс неудачную попытку: ошибка в коде, окружение, время вышло и другие. Число по группам складывается в число неудачных попыток.',
  },
  reviewRound: {
    term: 'раунд ревью',
    meaning:
      'Одно прочтение плана, контракта или изменений reviewer и его ответ с замечаниями. Повтор вызова после сбоя отдельным раундом не считается.',
  },
  wallTime: {
    term: 'время, когда шли попытки',
    meaning:
      'Сколько времени окна хотя бы одна попытка работала. Две попытки одновременно считаются один раз.',
  },
  attemptTime: {
    term: 'сумма времени попыток',
    meaning:
      'Время всех попыток окна, сложенное: две попытки по часу одновременно дают 2 ч. Больше «времени, когда шли попытки», когда работы шли параллельно.',
  },
  loadPeak: {
    term: 'пик нагрузки',
    meaning:
      'Наибольшее число попыток, которые шли одновременно в окне. Сравнивается с числом мест в настройках.',
  },
  windowSpend: {
    term: 'расход за окно',
    meaning:
      'Стоимость вызовов агентов, которые harness относит к окну, по правилам своего отчёта. «≥» — у части вызовов цена или учёт неизвестны или неполны, и настоящая сумма может быть больше; «неизвестно» — ни у одного вызова окна нет известной цены.',
  },
  typical: {
    term: 'обычное время этапа',
    meaning:
      'Сколько этот этап занимал раньше в этом состоянии, по уже закончившимся этапам (не меньше пяти замеров): половина укладывалась в первое число, девять из десяти — во второе. Это наблюдение, а не обещание.',
  },
  operator: {
    term: 'вы, оператор',
    meaning:
      'Человек, для которого идёт работа. Отвечает на вопросы, которые меняют результат для пользователя, и решает эскалации.',
  },
  host: {
    term: 'хост',
    meaning:
      'Программа, внутри которой запущен harness (например, DevContour). Может ответить на вопрос исполнителя от своего имени по своим правилам.',
  },
  remote: {
    term: 'в удалённой ветке',
    meaning:
      'harness сверяет принятый коммит с копией удалённой ветки на этой машине (remote-tracking ref, например origin/main) — без сети и без git fetch. Поэтому сведения могут отставать от удалённого репозитория до следующего git fetch или git push здесь. Время рядом — когда git на этой машине последний раз обновил эту копию. «Неизвестно» — не «нет» и не «отправлено». Сам harness ничего не отправляет: это делает человек или ведущий по вашей просьбе.',
  },
};

const enGlossary: Record<GlossaryId, { term: string; meaning: string }> = {
  lead: {
    term: 'lead agent',
    meaning:
      'The agent that runs the project on your behalf: it starts the harness, reads the results and answers the questions it is allowed to.',
  },
  writer: {
    term: 'writer',
    meaning: 'The agent that writes the code of one work order in its own copy of the repository.',
  },
  review: {
    term: 'review',
    meaning:
      'Another agent reads the plan or the changes and writes findings. Code review reads the diff and runs nothing unless stated otherwise.',
  },
  gates: {
    term: 'checks (gates)',
    meaning:
      'Project commands (tests, lint, build) the harness runs over a change. Each result is written with its method: ran, earlier evidence reused, not checked.',
  },
  stage: {
    term: 'stage',
    meaning:
      'The step a work order is at: queue, preparing, writing, checks, review, integrating, waiting for an answer.',
  },
  recheck: {
    term: 'recheck',
    meaning: 'Running a check again on the same attempt to tell a real failure from a flaky one.',
  },
  attempt: {
    term: 'attempt',
    meaning:
      'One pass of the writer over a work order. A work order has a limited number of attempts; an interruption at shutdown uses none.',
  },
  neutral: {
    term: 'neutral failure',
    meaning:
      'A failure that is not the code’s fault (for example, the environment). It uses no attempt but has its own limit.',
  },
  integration: {
    term: 'integration',
    meaning: 'Moving an accepted change into the target branch, with checks on the result.',
  },
  accepted: {
    term: 'accepted',
    meaning:
      'The work passed its checks and review, and the harness wrote the result into the target branch locally. "On the remote" is a separate fact: a person, or the lead at your request, pushes it there.',
  },
  drift: {
    term: 'drift',
    meaning:
      'The target branch changed after acceptance, so the accepted result is no longer at its tip.',
  },
  escalation: {
    term: 'escalation',
    meaning:
      'A blocking finding was not resolved within several review rounds, so the decision passes to you.',
  },
  temporary: {
    term: 'temporary decision',
    meaning: 'A "for now" decision, with a condition for when to come back to it.',
  },
  technical: {
    term: 'technical question',
    meaning:
      'A question whose answer does not change the result for the user. The lead may decide it when the settings allow it.',
  },
  lowerBound: {
    term: 'lower bound (≥)',
    meaning: 'Some prices are unknown, so the sum shown is a minimum; the real one may be higher.',
  },
  unknown: {
    term: 'unknown, not checked',
    meaning: 'The harness has no data. This is not zero and not "fine".',
  },
  controller: {
    term: 'controller',
    meaning: 'The harness process that drives the queue now. Without it nothing moves.',
  },
  stalled: {
    term: 'stalled / quiet attempt',
    meaning:
      'An attempt that has shown no sign of life for a while (quiet) or for longer than the limit (stalled).',
  },
  waitsQueue: {
    term: 'waits its turn',
    meaning:
      'The work waits for a free slot or for the works it depends on. Nothing needs to be done.',
  },
  decision: {
    term: 'decision',
    meaning:
      'The harness stopped a work order and will not continue it on its own: a person or the lead has to act — reset the attempts, approve the plan again, raise the budget and so on. It is not a question: a question comes from the writer and needs content in the answer; a decision is a permission to go on.',
  },
  waitsWork: {
    term: 'waits for another work order',
    meaning:
      'The work order depends on another one and starts once that one is accepted. Nothing needs to be done with it — act on the other work order, whoever is named there.',
  },
  answerBasis: {
    term: 'who answered and why',
    meaning:
      "Who gave the last answer to the writer's question: you, the lead or the host. The lead answers only under a rule from the settings — a technical question or one below the severity threshold — and records a reason; the harness shows it.",
  },
  failureBucket: {
    term: 'failure reason',
    meaning:
      'The group the harness put a failed attempt in: a code defect, the environment, time ran out and others. The counts per group add up to the failed attempts.',
  },
  reviewRound: {
    term: 'review round',
    meaning:
      'One reading of a plan, a contract or changes by the reviewer, and its answer with findings. A call repeated after a failure is not another round.',
  },
  wallTime: {
    term: 'time attempts were running',
    meaning:
      'How much of the window at least one attempt was running. Two attempts at once count once.',
  },
  attemptTime: {
    term: 'attempt time added up',
    meaning:
      'The durations of all attempts in the window, added: two one-hour attempts at once make 2 h. It exceeds "time attempts were running" when works ran in parallel.',
  },
  loadPeak: {
    term: 'peak load',
    meaning:
      'The most attempts running at the same time in the window, compared with the slots in the settings.',
  },
  windowSpend: {
    term: 'spend in the window',
    meaning:
      'The cost of agent calls the harness assigns to the window, by its report rules. "≥" means the price or accounting of some calls is unknown or incomplete, so the real sum may be higher; "unknown" means no call in the window has a known price.',
  },
  typical: {
    term: 'usual stage time',
    meaning:
      'How long this stage took before in this state, over stages that already finished (at least five samples): half fit within the first number, nine in ten within the second. An observation, not a promise.',
  },
  operator: {
    term: 'you, the operator',
    meaning:
      'The person the work is for. Answers the questions that change the result for the user and decides escalations.',
  },
  host: {
    term: 'host',
    meaning:
      "The program the harness runs inside (for example, DevContour). It may answer a writer's question on its own behalf under its own rules.",
  },
  remote: {
    term: 'on the remote branch',
    meaning:
      'The harness compares the accepted commit with this machine\'s copy of the remote branch (the remote-tracking ref, e.g. origin/main) — no network, no git fetch. So it may lag behind the remote repository until the next git fetch or git push here. The time beside it is when git on this machine last updated that copy. "Unknown" is neither "no" nor "pushed". The harness pushes nothing itself: a person does, or the lead at your request.',
  },
};

/** «5 мин» + «15 мин» → «5–15 мин»; different units stay apart: «50 мин – 1,5 ч». */
function joinRange(a: string, b: string, units: readonly string[]): string {
  for (const u of units)
    if (a.endsWith(u) && b.endsWith(u) && !/\D/.test(a.slice(0, -u.length).replace(/[.,]/, '')))
      return `${a.slice(0, -u.length)}–${b}`;
  return `${a} – ${b}`;
}

/** A label table: known codes map to words; any other code is shown as is. */
type Labels = Record<string, string>;

const ru = {
  langName: 'Русский',
  whatItMeans: 'что это значит',
  glossary: ruGlossary,
  unknown: 'неизвестно',
  notChecked: 'не проверено',
  noData: 'нет сведений',
  noDataInHarness: 'нет данных в этой версии harness',
  none: 'нет',
  yes: 'да',
  no: 'нет',
  byDefault: 'по умолчанию',
  listClipped: (n: number) => `ещё ${n} не показано (предел представления)`,
  // Navigation and app states.
  nav: {
    label: 'Разделы панели',
    overview: 'Обзор',
    reviews: 'Ревью',
    decisions: 'Решения',
    activity: 'Кто что делал',
    settings: 'Настройки',
    history: 'История',
    health: 'Здоровье',
    back: '← К обзору',
    backTasks: '← К задачам',
    language: 'Язык',
    tasks: 'Задачи',
    journal: 'Журнал',
    journalLabel: 'Разделы журнала',
  },
  app: {
    title: 'Панель harness',
    loading: 'Загружаю представление harness…',
    loadingWork: 'Загружаю детали работы…',
    empty: 'Состояния пока нет — сначала выполните',
    connectionLost: (e: string) => `Связь потеряна (${e}). На экране последнее представление.`,
    newerRevision: 'Данные новее панели — обновите devcontour-harness-ui, чтобы видеть всё.',
    incompatible: 'Панель не может показать эти данные:',
    notFound: 'Такого раздела нет.',
    readOnly: 'Панель только читает: ничего не запускает и не отвечает за вас.',
    liveQuestions: (n: number, clipped: boolean) =>
      `Ждут вашего ответа: ${rp(n, 'вопрос', 'вопроса', 'вопросов')}${clipped ? ' и, возможно, ещё (список обрезан)' : ''}.`,
    refusal: {
      NOT_A_VIEW: 'Данные не похожи на представление harness.',
      VIEW_VERSION_UNSUPPORTED: 'Эта версия панели не знает такой версии представления.',
      VIEW_UNAVAILABLE: 'Представление сейчас недоступно.',
    } as Labels,
    details: 'Подробности:',
    skip: 'К содержимому',
    newBuild: (v: string) =>
      `Панель обновилась${v ? ` (версия ${v})` : ''}: на этой вкладке открыта прежняя сборка.`,
    reload: 'Обновить страницу',
  },
  // Units and numbers.
  usdUnknown: 'неизвестно',
  usdOf: (spent: string, limit: string) => `${spent} из ${limit}`,
  ofLimit: (limit: string) => `из ${limit}`,
  duration: (h: number, m: number, s: number) =>
    h
      ? `${h} ч ${String(m).padStart(2, '0')} мин`
      : m
        ? s
          ? `${m} мин ${s} с`
          : `${m} мин`
        : `${s} с`,
  hours: (h: number) => `${h} ч`,
  days: (d: number) => rp(d, 'день', 'дня', 'дней'),
  typicalRange: (range: string) => `обычно ${range}`,
  range: (lo: number, hi: number, unit: string) =>
    lo === hi ? `${hi} ${unit}` : lo === 0 ? `до ${hi} ${unit}` : `${lo}–${hi} ${unit}`,
  unitMin: 'мин',
  unitSec: 'с',
  calls: (n: number) => rp(n, 'вызов', 'вызова', 'вызовов'),
  // Stages and actors.
  stage: {
    queued: 'В очереди',
    blocked: 'Ждёт условий',
    prepare: 'Подготовка',
    writer: 'Написание',
    gates: 'Проверки',
    review: 'Ревью',
    integration: 'Интеграция',
    input: 'Ждёт ответа',
    stopped: 'Остановлено',
    done: 'Принято локально',
    cancelled: 'Отменено',
    'plan-review': 'Ревью плана',
  } as Labels,
  actor: {
    operator: 'вы',
    lead: 'ведущий',
    controller: 'контроллер',
    host: 'хост',
    harness: 'harness',
    writer: 'исполнитель',
    reviewer: 'reviewer',
  } as Labels,
  liveness: { active: 'идёт', quiet: 'тихо', stalled: 'зависла' } as Labels,
  bucket: {
    defect: 'ошибка в коде',
    incomplete: 'работа не доделана',
    integration: 'интеграция',
    environment: 'окружение',
    'time-limit': 'время вышло',
    tool: 'инструмент',
    operator: 'действие оператора',
    budget: 'бюджет',
    unknown: 'причина неизвестна',
    unclassified: 'без группы',
    input: 'нужен ответ',
  } as Labels,
  // Harness action tokens (`stage.needs.action`, `escalations[].action`).
  action: {
    none: 'ничего не нужно',
    wait: 'подождать',
    'review-plan': 'согласовать план',
    retry: 'повторить попытку',
    'diagnose-failure': 'разобраться в причине сбоя',
    'reset-attempts': 'сбросить попытки',
    'raise-budget': 'увеличить бюджет',
    'replan-dependents': 'перепланировать зависимые работы',
    'recovery-decision': 'решить, как восстановить работу',
    'user-decision': 'принять решение',
    'resume-queue': 'снять очередь с паузы',
    'fix-environment': 'исправить окружение',
    'fix-access': 'исправить доступ',
    'answer-input': 'ответить на вопрос',
    'apply-input': 'применить ответ',
    answer: 'ответить на вопрос',
  } as Labels,
  // Header sentence and footer.
  header: {
    paused: 'очередь на паузе',
    running: (n: number) => `в работе ${n}`,
    queued: (n: number) => `в очереди ${n}`,
    stopped: (n: number) => `остановлено ${n}`,
    answer: (n: number) => `ответить на ${rp(n, 'вопрос', 'вопроса', 'вопросов')}`,
    decide: (n: number) => `принять ${rp(n, 'решение', 'решения', 'решений')}`,
    and: ' и ',
    maybeMore: ' и, возможно, ещё (список обрезан)',
    waiting: (n: number) =>
      `${n} ${ruPlural(n, ['работа ждёт', 'работы ждут', 'работ ждут'])} вашего действия`,
    unknownClipped: 'неизвестно — список обрезан',
    afterLead: ' (после ведущего)',
    nothing: 'ничего не нужно',
    now: (parts: string) => `Сейчас: ${parts}.`,
    idle: 'Сейчас ничего не выполняется.',
    fromYou: (what: string) => ` От вас: ${what}.`,
  },
  // Freshness of the shown data (S3 live updates).
  live: {
    at: (at: string, same: string | undefined, how: string) =>
      `Данные на ${at}${same ? ` (без изменений с ${same})` : ''} · ${how}`,
    push: 'обновляются сами',
    poll: 'проверка раз в 5 секунд',
    snapshot: 'снимок; при изменении файла страница обновится',
    unknownTime: 'неизвестное время',
    stale: (since: string, message: string, at: string) =>
      `Не удалось обновить данные с ${since}: ${message}. На экране данные на ${at} — они могут быть устаревшими.`,
  },
  footer: (at: string | undefined) =>
    `Данные harness на ${at ?? 'неизвестное время'}; панель ничего не меняет.`,
  yesterday: (time: string) => `вчера ${time}`,
  target: {
    unknown: (why: string) => `Принято локально; в удалённом репозитории — неизвестно${why}.`,
    pushedOn: (ref: string | undefined) =>
      `Принято локально; уже в удалённой ветке${ref ? ` ${ref}` : ''}.`,
    notPushedOn: (ref: string | undefined) =>
      `Принято локально; в удалённой ветке${ref ? ` ${ref}` : ''} ещё нет.`,
    checkedAt: (when: string) =>
      `Сверено с копией удалённой ветки на этой машине, без сети; git обновил копию: ${when}.`,
    checkedAtUnknown:
      'Сверено с копией удалённой ветки на этой машине, без сети; когда git обновлял копию — неизвестно.',
    noTarget: (sha: string) =>
      `Принято локально (результат ${sha}); в удалённом репозитории — неизвестно: harness не сообщил цель.`,
    noLocation: 'Принято; где — неизвестно: harness не сообщил цель.',
    notYet: 'Ещё не принято.',
    seeChecks: 'что проверено',
    short: {
      pushed: 'в удалённом репозитории — да',
      'not-pushed': 'в удалённом репозитории — ещё нет',
    } as Labels,
    shortUnknown: 'в удалённом репозитории — неизвестно',
  },
  // Questions.
  question: {
    youOrLead: 'Ответить можете вы или ведущий (технический вопрос).',
    onlyYou: 'Ответить можете только вы.',
    answeredNotApplied: 'Ответ дан; ведущий или контроллер ещё должен его применить.',
    carryStale:
      'Перенесённый ответ заменённого вопроса устарел; ведущий переносит его заново или отзывает.',
    appliedAwaitingClaim: 'Ответ применён; ждёт начала следующей попытки.',
    delivered: 'Ответ передан исполнителю; ничего делать не нужно.',
    unknownState: (s: string) => `Состояние ${s}; посмотрите перед действием.`,
    severity: (n: number) => `важность ${n}`,
    whatChanges: 'Что изменится:',
    full: 'Полный вопрос:',
    version: (n: number) => `версия ${n}`,
    answeredBy: (who: string) => `ответил: ${who}`,
    basis: (at: string, line: string) => `${at} — ${line}`,
    cancelled: 'Вопрос снят.',
    superseded: 'Вопрос заменён.',
    leadAnswers:
      'Отвечает ведущий: вопрос технический, и политика разрешает ему отвечать на такие. Вы тоже можете ответить.',
  },
  // First line of the Overview.
  story: {
    empty: 'Работ пока нет.',
    allDone: (done: number, total: number, cancelled: number) =>
      `Все работы приняты: ${done} из ${total}${cancelled ? `; отменено ${cancelled}` : ''}.`,
    allCancelled: (n: number) =>
      `Все работы отменены (${n}); принятых нет — что дальше, решает ведущий.`,
    harnessDone: (done: number, outside: number) =>
      `Всё, что передано в harness, принято (${done}); ещё ${rp(outside, 'задача не передана', 'задачи не переданы', 'задач не передано')} в harness — их передаёт ведущий.`,
    onlyOutside: (outside: number) =>
      `В harness пока нет работ; ${rp(outside, 'задача ждёт', 'задачи ждут', 'задач ждут')} передачи от ведущего.`,
    workAt: (name: string, stage: string) => `${name} (этап «${stage}»)`,
    running: (works: string[], more: number) =>
      `Сейчас harness работает над ${works.join(' и ')}${more ? ` и ещё ${rp(more, 'работой', 'работами', 'работами')}` : ''}.`,
    runningUnlisted: (n: number) =>
      `Сейчас harness работает над ${rp(n, 'работой', 'работами', 'работами')}.`,
    paused: 'Сейчас ничего не выполняется: очередь на паузе.',
    waitsYou: 'Сейчас ничего не выполняется: работа ждёт вашего ответа или решения.',
    standing: 'Сейчас ничего не выполняется: harness не запущен.',
    waitsOthers: 'Сейчас ничего не выполняется: работы ждут своей очереди или ведущего.',
  },
  // «Проблемы по ходу».
  problems: {
    kindQueue: 'очередь',
    kindStopped: 'остановка',
    kindHealth: 'сбой',
    kindBudget: 'бюджет',
    kindDrift: 'изменено после приёмки',
    standing:
      'очередь стоит: harness не запущен, и после ответа или сброса работа сама не продолжится',
    lastFailure: (attempt: number, plain: string) => `попытка ${attempt} остановилась: ${plain}`,
    stoppedNoReason: 'остановлена, причина не сообщена',
    writerEnv: (attempt: number) =>
      `попытка ${attempt}: ждёт ведущего — окружение не дало исполнителю выполнить нужный шаг; попытка не засчитана`,
    stalled: (n: number) => `${rp(n, 'попытка зависла', 'попытки зависли', 'попыток зависло')}`,
    environment: (n: number) => `сбоев окружения: ${n}`,
    budgetExceeded: (spent: string, scope: string) =>
      `бюджет превышен (${scope}): потрачено ${spent}`,
    drifted: (n: number) =>
      `${rp(n, 'принятая работа изменена', 'принятые работы изменены', 'принятых работ изменены')} после приёмки`,
  },
  // Rough times.
  rough: {
    underMinute: 'меньше минуты',
    minutes: (n: number) => `${n} мин`,
    hours: (h: number) => `${String(h).replace('.', ',')} ч`,
    about: (x: string) => `около ${x}`,
    upTo: (x: string) => `до ${x}`,
    between: (a: string, b: string) => joinRange(a, b, [' мин', ' ч']),
  },
  eta: {
    stageLeft: (range: string) => `осталось на этапе: ${range}`,
    stageOver: (max: string) => `этап идёт дольше обычного (обычно до ${max})`,
    stageUnknown: 'сколько осталось на этапе — неизвестно',
    attempt: (avg: string) => `одна попытка в среднем около ${avg}`,
    unknown: 'срок неизвестен',
  },
  // Tasks screen.
  tasks: {
    label: 'Задачи',
    title: 'Задачи',
    intro:
      'Каждая карточка — одна работа: что с ней сейчас, сколько попыток осталось, сколько раундов ревью прошло и кто действует дальше.',
    empty: 'Работ пока нет.',
    phase: {
      accepted: 'Принята',
      cancelled: 'Отменена',
      running: 'Идёт работа',
      question: 'Ждёт ответа',
      stopped: 'Остановлена',
      dependency: 'Ждёт другую работу',
      queued: 'В очереди',
      other: 'Ждёт',
    } as Labels,
    nowRunning: (stage: string, elapsed: string) =>
      `Сейчас: этап «${stage}»${elapsed ? `, идёт ${elapsed}` : ''}.`,
    nowAccepted: 'Принята; от неё больше ничего не нужно.',
    nowCancelled: 'Отменена.',
    nowWaits: (reason: string) => `Сейчас: ${reason}.`,
    nowQueued: 'Сейчас: ждёт своей очереди.',
    nowStage: (stage: string) => `Сейчас: этап «${stage}».`,
    nowWriterEnv:
      'Ждёт ведущего: окружение не дало исполнителю выполнить нужный шаг. Попытка не засчитана.',
    attempts: (used: number, max: number, left: number) =>
      `Попытки: израсходовано ${used} из ${max}, осталось ${left}`,
    reviewRounds: (used: number, max: number | null) =>
      `Раунды ревью кода: ${used}${max !== null ? ` из ${max}` : ''}`,
    noReview: 'Ревью кода ещё не было',
    next: {
      nobody: 'Дальше: ничего не нужно',
      harness: (stage: string) => `Дальше действует: harness (этап «${stage}»)`,
      actors: (who: string) => `Дальше действует: ${who}`,
      dependency: (on: string) => `Дальше: ждёт ${on}`,
      queue: 'Дальше: ждёт своей очереди, ничего не нужно',
      unknown: 'Кто действует дальше — неизвестно',
    },
    questions: (n: number) => `Вопросы по задаче (${n})`,
    waitsOn: (works: string) => `Начнётся после: ${works}.`,
    open: 'Весь процесс',
    outside: (n: number) => `Ещё не переданы в harness (${n})`,
    otherReviews: (n: number) => `Ревью плана и договоров (${n})`,
    reviewsMoved: 'Раздел «Ревью» теперь внутри задач: ревью — один из этапов процесса.',
  },
  // Process timeline of a work.
  timeline: {
    title: 'Процесс',
    stage: {
      prepare: 'Подготовка',
      writer: 'Написание кода',
      gates: 'Проверки',
      review: 'Ревью',
      integration: 'Интеграция',
      acceptance: 'Приёмка',
    } as Labels,
    state: {
      passed: 'пройдено',
      failed: 'не прошло',
      current: 'идёт сейчас',
      ahead: 'впереди',
      skipped: 'не дошло',
      next: 'в следующей попытке',
      'not-needed': 'не понадобилось',
      unknown: 'итог неизвестен',
    } as Labels,
    attempt: (n: number) => `Попытка ${n}`,
    latest: 'последняя',
    earlier: (n: number) => `Прежние попытки (${n})`,
    noAttempts: 'Попыток ещё не было: процесс начнётся с подготовки.',
    unused: 'не используется',
    part: {
      fixed: {
        'dependency-store': 'хранилище зависимостей',
        prepare: 'подготовка зависимостей',
        'integration-prepare': 'подготовка зависимостей при интеграции',
        'writer-dependencies': 'зависимости исполнителя',
        implementation: 'исполнитель пишет код',
        'implementation-reuse': 'взят прежний код',
        'candidate-review': 'ревью кода',
        'integration-review': 'ревью интеграции',
        'integration-wait': 'ожидание интеграции',
      } as Labels,
      check: (gate: string) => `проверка ${gate}`,
      recheck: (gate: string) => `повторная проверка ${gate}`,
      consumerCheck: (gate: string, repo: string) => `проверка ${gate} у ${repo}`,
      generate: (id: string) => `генерация ${id}`,
      port: (port: string) => `проверка порта ${port}`,
      inRepo: (what: string, repo: string) => `${what} у ${repo}`,
      atIntegration: (what: string) => `${what} при интеграции`,
      environment: {
        setup: 'запуск окружения',
        ready: 'окружение готово',
        cleanup: 'очистка окружения',
      } as Labels,
      environmentOther: 'шаг окружения',
      other: 'другой шаг harness',
    },
    total: (d: string) => `всего ${d}`,
    label: (stage: string, state: string, duration: string) =>
      `${stage}: ${state}${duration ? `, ${duration}` : ''}`,
  },
  // Appearance (Settings).
  theme: {
    title: 'Оформление',
    label: 'Тема',
    system: 'Как в системе',
    light: 'Светлая',
    dark: 'Тёмная',
    note: 'Выбор хранится только в этом браузере.',
  },
  // Overview.
  overview: {
    label: 'Обзор harness',
    queueRunning: 'Очередь идёт',
    queuePaused: (reason: string) => `Очередь на паузе${reason ? ` (${reason})` : ''}`,
    queueWho: (who: string, action: string) => `действует: ${who}${action ? ` — ${action}` : ''}`,
    acceptedOf: (done: number, total: number) => `принято ${done} из ${total}`,
    plan: 'План',
    planClipped: 'список работ обрезан — показана только часть плана',
    after: (ids: string) => `после ${ids}`,
    needsYou: (n: number) => (n ? `Нужно от вас (${n})` : 'Нужно от вас'),
    noQuestions: 'Сейчас от вас ничего не нужно.',
    unknownQuestionState:
      'Неизвестно: у вопроса состояние, которого панель не знает — посмотрите его в «Другие вопросы».',
    otherQuestions: 'Другие вопросы — ответ уже есть или его даёт не вы',
    kindQuestion: 'вопрос',
    unlistedAnswers: (works: string) =>
      `Ждут вашего ответа, но вопрос в этом представлении не показан: ${works}. Откройте работу или выполните harness input-show.`,
    kindDecision: 'решение',
    why: 'Почему:',
    attempts: 'Попытки:',
    leadFirst: (what: string) =>
      `Сначала ведущий: ${what}. Потом — вы: до этого harness не начнёт новую попытку, и сброс ничего не изменит.`,
    howAsk: 'Как: попросите ведущего или выполните сами:',
    details: 'подробности',
    recordSource: {
      blocker: 'причина',
      escalation: 'эскалация',
      needs: 'этап ждёт',
    } as Labels,
    workIds: 'работы:',
    others: (n: number) => (n ? `Остальные ожидания (${n})` : 'Остальные ожидания'),
    noOthers: 'Никто, кроме вас, сейчас ничего не должен сделать.',
    yoursAbove: (n: number) => `Ваши решения и вопросы (${n}) — в разделе «Нужно от вас» выше.`,
    byLead: (n: number) => `Делает ведущий (${n})`,
    leadNote:
      'Это действие ведущего агента, а не ваше. Если долго ничего не меняется — напомните ему.',
    byOther: (who: string, n: number) => `Делает ${who} (${n})`,
    byDependency: (n: number) => `Ждут другой работы (${n})`,
    waitsFor: 'ждёт',
    nextThere: (who: string) => `по ней дальше действует: ${who}`,
    then: ', затем ',
    nobodyThere: 'по ней никто — просто ждёт очереди',
    runningThere: (stage: string) => `по ней действует: harness — этап «${stage}»`,
    waitsThere: 'по ней никто — она сама ждёт другой работы',
    cancelledThere: 'она отменена — ведущему нужно перепланировать',
    unknownThere: (stage: string | undefined) =>
      `по ней кто действует — неизвестно${stage ? ` (этап «${stage}»)` : ' (её нет в этом представлении)'}`,
    unlistedWaiting: (n: number) =>
      `Ещё ${n} ${ruPlural(n, ['работа ждёт', 'работы ждут', 'работ ждут'])} вашего действия, но в этом представлении не ${n === 1 ? 'показана' : 'показаны'} — выполните harness status.`,
    now: (running: number, slots: number) => `Сейчас в работе (${running} из ${slots} мест)`,
    nothingRunning: 'Сейчас ничего не выполняется.',
    runningUnlisted: (n: number) =>
      `Ещё ${rp(n, 'работа', 'работы', 'работ')} в работе не показаны (предел представления).`,
    attemptsShort: (used: number, max: number, left: number) =>
      `попытка ${used} из ${max}, осталось ${left}`,
    lastStopped: (plain: string) => `прошлая остановлена: ${plain}`,
    whoActs: (who: string, action: string) => `действует: ${who} — ${action}`,
    resetCommand: (id: string) =>
      `harness retry --state <state> --work ${id} --reset --reason "<причина>"`,
    waiting: 'Ждут очереди',
    noWaiting: 'В очереди ничто не ждёт.',
    accepted: (n: number) => `Принятые (${n})`,
    acceptedUnlisted: (n: number, clipped: boolean) =>
      `У ${rp(n, 'принятой работы', 'принятых работ', 'принятых работ')} нет сведений о месте в этом представлении${clipped ? ' (предел представления)' : ''}.`,
    budget: 'Бюджет',
    noBudget: 'бюджета нет',
    budgetUnknown: 'бюджет неизвестен',
    spent: (s: string) => `потрачено ${s}`,
    controller: 'Контроллер',
    controllerPresent: 'работает',
    controllerAbsent: 'не запущен',
    stalled: 'Зависшие попытки',
    drift: 'Изменено после приёмки',
    driftNotChecked: (n: number) => `не проверено: ${n}`,
    warnings: 'Предупреждения harness',
    queueStanding: 'Очередь стоит',
    queueDone: 'Всё принято',
    queueHarnessDone: 'Всё, что в harness, принято',
    queueCancelled: 'Всё отменено',
    legendCancelled: 'отменены',
    standingWhy: 'harness не запущен, и сама очередь не пойдёт',
    standingWho: 'ведущему нужно снова запустить harness',
    scopeTitle: 'Весь объём работ',
    scopeCounts: (done: number, total: number, running: number, waiting: number) =>
      `Сделано ${done} из ${total} · в работе ${running} · ждут ${waiting}`,
    scopeOutside: (n: number) => `· ещё не переданы в harness: ${n}`,
    scopeCancelled: (n: number) => `· отменено ${n}`,
    etaNoTotals:
      'Сколько осталось, пока сказать нельзя: эта версия harness не сообщает итоги окна истории (время попыток).',
    legendDone: 'приняты',
    legendRunning: 'в работе',
    legendWaiting: 'ждут',
    legendOutside: 'ещё не в harness',
    etaNothingLeft: 'Оставшейся работы нет.',
    etaLeft: (range: string, n: number) =>
      `Осталось: ${range} на ${rp(n, 'работу', 'работы', 'работ')} — если каждой хватит одной попытки; ожидание ответов людей сюда не входит.`,
    etaUnknown: (n: number) =>
      `Сколько осталось, пока сказать нельзя: нужно хотя бы ${rp(n, 'попытка', 'попытки', 'попыток')} за окно истории, чтобы знать их обычную длину.`,
    etaBasis: (avg: string, n: number) =>
      `Оценка по фактическому времени: попытка в среднем длится ${avg} (по ${n} ${ruPlural(n, ['попытке', 'попыткам', 'попыткам'])}, начатым в окне истории).`,
    outsideTitle: (n: number) => `Ещё не переданы в harness (${n})`,
    outsideState: {
      'not-handed-over': 'не передана в harness',
      'not-ready': 'ждёт готовности',
      'in-harness': 'в harness',
    } as Labels,
    scopeMissing:
      'Показаны только работы, которые уже переданы в harness: эта версия harness не сообщает остальные задачи прогона.',
    howAskLead: 'Как: попросите ведущего сбросить попытки (команда — в «подробностях»).',
    problems: (n: number) => (n ? `Проблемы по ходу (${n})` : 'Проблемы по ходу'),
    noProblems: 'Проблем по ходу не видно.',
    stageFor: (elapsed: string) => `идёт ${elapsed}`,
    command: 'команда:',
    unknownAction: 'Действие, которое панель не знает',
    otherSubject: 'не про одну работу (см. «подробности»)',
  },
  // Release forecast rings (revision 4, harness `forecast`).
  forecast: {
    label: 'Прогноз выпуска',
    release: 'До релиза',
    time: 'Время',
    percent: (p: number) => `~${p} %`,
    doneWord: 'готово',
    leftWord: 'осталось',
    unknownMark: '?',
    unknownWord: 'неизвестно',
    basisScope: 'Считается по всем задачам прогона, включая ещё не переданные в harness.',
    basisWorks: 'Считается только по работам harness: срез прогона из трекера задач неизвестен.',
    basisOther: (b: string) => `Основа подсчёта: ${b}.`,
    span: (h: number, m: number) => (h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} мин`),
    elapsed: (d: string) => `прошло ${d}`,
    notStarted: 'ещё не начиналось',
    left: (r: string) => `осталось ${r}`,
    nothingLeft: 'осталось: ничего',
    leftUnknown: 'сколько осталось — неизвестно',
    leftUnknownWhy:
      'Почему неизвестно: закончившихся попыток пока слишком мало, чтобы оценить их обычную длину. Нулём это не показывается.',
    basis: (samples: number, perTask: string) =>
      `По ${rp(samples, 'закончившейся попытке', 'закончившимся попыткам', 'закончившимся попыткам')}; попыток на принятую задачу — ${perTask}.`,
    humanWait: (n: number, d: string) =>
      `Ждут людей или ведущего сейчас: ${rp(n, 'работа', 'работы', 'работ')}, дольше всех — ${d}. В прогноз это не входит.`,
    noHumanWait: 'Сейчас никто не ждёт людей или ведущего.',
    harnessSays: 'Так же это пишет harness status:',
    notPromise: 'Это наблюдение по уже прошедшим попыткам, а не обещание.',
    timeRing:
      'Круг «Время»: закрашена прошедшая часть от «прошло + осталось» по верхней границе; светлая дуга — насколько больше она по нижней границе.',
    releaseText: (line: string) => `До релиза: ${line}`,
    timeText: (line: string) => `Время: ${line}`,
    none: 'Прогноза нет: harness не даёт его для этого объёма (работ нет или все отменены).',
    fallback:
      'Круговые индикаторы «До релиза» и «Время» показываются с devcontour-harness 0.1.0-alpha.60: эта версия harness не сообщает прогноз (поле forecast). Ниже — прежняя полоса и грубая оценка панели.',
  },
  // Revision 4 additions to the existing screens.
  r4: {
    queueBy: (who: string) => `запускает: ${who}`,
    scopeClipped: (n: number) =>
      `Ещё ${rp(n, 'задача', 'задачи', 'задач')} среза прогона не показано (предел представления); их состояние здесь неизвестно.`,
    harnessCounts: (done: number, total: number, running: number, waiting: number) =>
      `В harness: принято ${done} из ${total} · в работе ${running} · ждут ${waiting}`,
    scopeDropped: (n: number) =>
      `Срез прогона (${rp(n, 'задача', 'задачи', 'задач')}) не поместился в представление: показаны только работы harness.`,
    planReview: (works: string[]) =>
      `Сейчас harness проводит ревью плана: ${works.join(', ')}; от ведущего для него ничего не нужно.`,
    leadFirstOrdered: (steps: string) => `Сначала ${steps}. Затем — вы.`,
    actorDoes: (who: string, what: string) => `${who}: ${what}`,
    leadStop: (attempt: number) =>
      `попытка ${attempt}: ждёт ведущего — работа остановилась до результата; попытка не засчитана`,
    nowLeadStop: 'Ждёт ведущего: работа остановилась до результата. Попытка не засчитана.',
    counted: 'попытка засчитана',
    notCounted: 'попытка не засчитана',
    options: 'Варианты ответа:',
    recommended: 'рекомендуется',
    rationale: 'Обоснование исполнителя:',
    kindSource: 'вопрос в трекере',
    sourceAnswerThere: 'Отвечают в трекере задач, панель только показывает вопрос.',
    sourceOpen: (ref: string) => `Открыть ${ref} в трекере`,
    sourceRef: (ref: string) => `документ ${ref} в трекере`,
    sourceRecommendation: 'Рекомендация:',
    sourceProvisional: 'Пока ответа нет, работа идёт с временным ответом:',
    sourceTasks: (keys: string) => `Задачи: ${keys}`,
    sourceReadAt: (when: string) => `Прочитано из трекера ${when}; это не живое чтение.`,
    sourceClipped: (n: number) =>
      `ещё ${rp(n, 'вопрос', 'вопроса', 'вопросов')} из трекера не показано (предел представления)`,
    sourcesTitle: 'Источники задач',
    sourceLevel: {
      recommended: 'версия трекера рекомендуемая',
      'below-recommended': 'версия трекера ниже рекомендуемой',
    } as Labels,
    sourceContext: (yes: boolean): string =>
      yes ? 'контекст задачи передаётся исполнителю' : 'контекст задачи не передаётся исполнителю',
    sourceContract: (n: number) => `договор REST ${n}`,
    sourceChecked: (when: string) => `проверено ${when}`,
    updatesTitle: 'Обновления',
    whatsNew: 'что нового',
    howToUpdate: 'как обновить',
    updateNote: 'Ставит ведущий или вы в терминале проекта; панель ничего не устанавливает.',
    updatesMode: 'Режим',
    updatesModeNote:
      'Режим задаётся в .harness/updates.json (команда harness update); здесь он только показан.',
    mode: {
      auto: 'ставить само в безопасных пределах',
      notify: 'только сообщать',
      off: 'не проверять',
    } as Labels,
    updatesState: 'Последняя проверка',
    state: {
      'up-to-date': 'стоит последняя версия',
      available: 'доступна новая версия',
      'needs-decision': 'доступна версия со сменой форматов — нужно решение владельца',
      unavailable: 'реестр не ответил',
      'not-checked': 'ещё не проверялось',
    } as Labels,
    current: (h: string, ui: string | undefined) =>
      `Стоит: devcontour-harness ${h}${ui ? `, панель ${ui}` : ''}`,
    available: (h: string, ui: string | undefined) =>
      `Доступно: devcontour-harness ${h}${ui ? `, панель ${ui}` : ''}`,
    checkedAt: (when: string) => `проверено ${when}`,
    notCheckedYet: 'когда проверялось — неизвестно',
  },
  budgetScope: { total: 'общий', group: 'группа', work: 'работа' } as Labels,
  budgetState: {
    within: 'в пределах',
    exceeded: 'превышен',
    undetermined: 'не определено',
  } as Labels,
  // Blockers.
  blocker: {
    nobody: 'никто — просто ждёт очереди, ничего не нужно',
    whoActs: (who: string) => `действует: ${who}`,
    noReason: (code: string) => `причина не описана (код ${code})`,
    stoppedNoReason: 'причина не сообщена; кто действует — неизвестно',
  },
  // Work detail.
  work: {
    label: (id: string) => `Работа ${id}`,
    now: 'Сейчас',
    since: (clock: string, elapsed: string) => `с ${clock}, ${elapsed}`,
    next: (stages: string) => `Дальше: ${stages}.`,
    nothingNext: 'Дальше этапов нет.',
    needs: (who: string, action: string) => `Ждёт: ${who} — ${action}.`,
    stages: 'Этапы',
    stagePassed: 'пройден',
    stageFailed: 'не пройден',
    stageCurrent: 'идёт сейчас',
    stageAhead: 'впереди',
    stageNoOutcome: 'исход неизвестен',
    whyRetry: 'Почему повтор',
    attemptsLine: (used: number, max: number, left: number) =>
      `Попытка ${used} из ${max} (осталось ${left}).`,
    lastFailure: (n: number, plain: string) => `Попытка ${n} остановлена: ${plain}.`,
    failureGroup: (g: string) => `Группа сбоя: ${g}.`,
    failureUnknown: 'Причина прошлой остановки неизвестна.',
    rechecks: (n: number) => `Перепроверок: ${n}.`,
    neutral: (used: number, max: number) => `Нейтральных сбоев: ${used} из ${max}.`,
    interrupted: (n: number) => `Прервано при остановке: ${n} (попытки не расходуются).`,
    attempts: 'Попытки',
    noAttempts: 'Попыток ещё не было.',
    attemptRow: (n: number) => `Попытка ${n}`,
    attemptStatus: {
      active: 'идёт',
      running: 'идёт',
      failed: 'сбой',
      expired: 'истекла',
      succeeded: 'успешно',
      done: 'завершена',
      cancelled: 'отменена',
    } as Labels,
    interruptedRow: 'прервана при остановке — попытку не расходует',
    startedAt: (at: string) => `начата ${at}`,
    finishedAt: (at: string) => `закончена ${at}`,
    whatChecked: 'Что проверено',
    noVerification: 'Нет сведений о проверках.',
    emptyVerification: 'Строк проверок нет.',
    gate: 'проверка',
    reviewRow: 'ревью',
    phase: { candidate: 'кандидат', integration: 'интеграция' } as Labels,
    result: {
      passed: 'пройдено',
      failed: 'не пройдено',
      reused: 'засчитано по прежнему результату',
      skipped: 'не применяется',
      'not-run': 'ещё не запускалось',
    } as Labels,
    resultOther: (r: string) => `результат ${r}`,
    howExecuted: (n: number | undefined) =>
      n === undefined ? 'запущено (попытка неизвестна)' : `запущено в попытке ${n}`,
    howReused: (n: number | undefined) =>
      n === undefined
        ? 'взято прежнее доказательство'
        : `взято прежнее доказательство (для попытки ${n})`,
    howRead: 'прочитал diff, ничего не запускал',
    howNotChecked: 'не проверялось',
    howUnknown: (h: string) => `способ неизвестен (${h})`,
    by: (who: string) => `кем: ${who}`,
    byUnknown: 'кем — неизвестно',
    spend: 'Расходы',
    spendLine: (usd: string, calls: string, time: string) => `${usd} · ${calls} · ${time}`,
    blockers: 'Что мешает',
    noBlockers: 'Ничто не мешает.',
    questions: 'Вопросы',
    noQuestions: 'Вопросов нет.',
    reviews: 'Ревью этой работы',
    noReviews: 'Ревью этой работы нет.',
    accepted: 'Принято: локально и в удалённом репозитории',
    drift: 'Дрейф после приёмки',
    noDriftAccepted: 'Целевая ветка не сдвигалась после приёмки (по чтению harness).',
    noDriftUnknown: 'Нет сведений о дрейфе: harness не сообщил цель.',
    notAccepted: 'Работа ещё не принята — дрейфа быть не может.',
    detailClipped: (what: string, n: number) => `${what}: ещё ${n} не показано (предел).`,
    detailUnavailable: 'Детали работы недоступны:',
    clippedName: {
      attempts: 'Попытки',
      findings: 'Замечания',
      verification: 'Проверки',
      stages: 'Этапы попыток',
      reviews: 'Ревью',
      questions: 'Вопросы',
      blockers: 'Причины ожидания',
      dependsOn: 'Зависимости',
    } as Labels,
  },
  drift: {
    row: (ref: string, from: string, to: string) => `${ref}: принято ${from} → сейчас ${to}`,
    headUnknown: 'вершина неизвестна',
    commits: (n: number) => `коммитов после: ${n}`,
    files: (n: number) => `файлов: ${n}`,
    diverged: 'ветка разошлась с принятым результатом',
    unavailable: (why: string) => `не проверено: ${why}`,
  },
  // Reviews.
  reviews: {
    label: 'Ревью',
    none: 'Ревью пока не было.',
    kind: { plan: 'план', contract: 'договор', code: 'код' } as Labels,
    approved: 'одобрено',
    notApproved: 'не одобрено',
    rounds: (used: number, max: number | null) =>
      max === null ? `раундов ${used}, без предела` : `раунды ${used} из ${max}`,
    open: (blocking: number, notes: number) => `открыто: блокирующих ${blocking}, заметок ${notes}`,
    acceptedLimits: (n: number) => `принято как ограничение: ${n}`,
    reviewer: (who: string) => `reviewer: ${who}`,
    reviewerUnknown: 'reviewer неизвестен',
    sameVendor: 'тот же вендор, что у исполнителя',
    findings: (n: number) => `Замечания (${n})`,
    noFindings: 'Замечаний нет.',
    finding: {
      open: 'открыто',
      closed: 'закрыто',
      withdrawn: 'снято',
      'accepted-limitation': 'принято как ограничение',
    } as Labels,
    findingRounds: (n: number) => `раундов: ${n}`,
    disposition: {
      'accepted-limitation': 'принято как ограничение',
      continue: 'решено продолжать',
    } as Labels,
    decidedBy: (decision: string, who: string, round: number) =>
      `${decision} · кто решил: ${who}, раунд ${round}`,
    escalation: (requestId: string, findings: string) =>
      `Эскалация ${requestId}: ${findings} — решает оператор`,
    escalationAnswered: 'ответ дан',
    escalationOpen: 'ответа ещё нет',
    escalations: (n: number) => `Ждут решения (${n})`,
    noEscalations: 'Эскалаций и остановок, ждущих решения, нет.',
    col: {
      subject: 'Предмет',
      kind: 'Вид',
      rounds: 'Раунды',
      open: 'Открыто',
      accepted: 'Принято как ограничение',
      reviewer: 'Reviewer',
    },
  },
  // Decisions.
  decisions: {
    label: 'Решения',
    missing: 'Производитель пока не сообщает решения.',
    temporary: (n: number) => `Временные (${n})`,
    noTemporary: 'Временных решений нет.',
    all: (n: number) => `Все решения (${n})`,
    none: 'Решений пока не было.',
    kind: {
      'accepted-limitation': 'замечание принято как ограничение',
      'technical-answer': 'ответ на технический вопрос',
      continue: 'решено продолжать',
    } as Labels,
    by: (who: string) => `кто решил: ${who}`,
    revisit: (when: string) => `вернуться: ${when}`,
    revisitUnknown: 'условие пересмотра неизвестно',
    reason: (why: string) => `причина: ${why}`,
    reasonMissing: 'причина не записана',
    about: 'по',
  },
  // Activity.
  activity: {
    label: 'Кто что делал',
    missing: 'harness этой версии не ведёт ленту.',
    none: (window: string) => `За окно (${window}) ничего не происходило.`,
    noneFiltered: 'По выбранному фильтру событий нет.',
    window: (window: string) =>
      `События harness за последние ${window}, новые сверху. Фразы — как их записал harness.`,
    windowUnknown: 'События harness за окно истории, новые сверху. Фразы — как их записал harness.',
    filterWork: 'Работа',
    filterActor: 'Кто',
    all: 'все',
    shown: (n: number, total: number) => `показано ${n} из ${total}`,
    clipped: (n: number) =>
      `Ещё ${rp(n, 'событие', 'события', 'событий')} окна не показано: лента держит 50 последних.`,
    who: 'Кто есть кто',
    accepted: 'где: принято локально; удалённая ветка — в деталях работы;',
    openWork: 'открыть работу',
  },
  // Settings.
  settings: {
    label: 'Настройки (только чтение)',
    who: 'Кто работает',
    role: (role: string, repo: string | undefined) =>
      repo ? `роль ${role} в репозитории ${repo}` : `роль ${role}`,
    writer: 'пишет',
    binding: (runtime: string, model: string | undefined, effort: string | undefined) =>
      [runtime, model, effort ? `усилие ${effort}` : undefined].filter(Boolean).join(' · '),
    approvalMode: 'Кто утверждает обычные этапы',
    approval: { agent: 'ведущий агент', operator: 'оператор' } as Labels,
    mode: 'Режим',
    modes: { live: 'настоящие модели', fixture: 'фикстуры, без моделей' } as Labels,
    concurrency: 'Одновременных работ',
    reviewers: 'Кто проверяет',
    rule: (kind: string, scope: string) => `${kind}: ${scope}`,
    scope: {
      global: 'общее правило',
      repository: 'для репозитория',
      role: 'для роли',
    } as Labels,
    scopeOf: (scope: string, id: string | undefined) => (id ? `${scope} ${id}` : scope),
    alternates: (list: string) => `запасные: ${list}`,
    noAlternates: 'запасных нет',
    vendor: {
      'different-vendor': 'reviewer другого вендора',
      'same-vendor-allowed': 'тот же вендор допускается',
    } as Labels,
    effective: 'Действующий reviewer кода для каждой роли',
    effectiveFrom: (source: string) => `откуда: ${source}`,
    effectiveNone: 'правило не найдено',
    effectiveClipped:
      'Список правил ревью обрезан: действующий reviewer может задаваться правилом, которого здесь нет.',
    anyRepo: 'в остальных репозиториях',
    ask: 'Когда спрашивать вас',
    threshold: (n: number) =>
      n >= 11
        ? 'Вопросы не ждут ответа: harness работает автономно (порог 11).'
        : `Вопросы важности ${n} и выше ждут ответа.`,
    leadMax: (n: number | undefined) =>
      n === undefined
        ? 'Ведущий не отвечает на вопросы, которые ждут ответа.'
        : `Ведущий может ответить на вопросы важности до ${n}.`,
    technical: (on: boolean) =>
      `Технические вопросы решает ведущий: ${on ? 'да' : 'нет'}; вопросы, меняющие результат для пользователя, — всегда вам.`,
    criticalPaths: (n: number) => `Критических путей: ${n}.`,
    limits: 'Пределы',
    maxAttempts: 'Попыток на работу',
    repairBudget: 'Бюджет исправлений',
    maxNeutral: 'Нейтральных сбоев на работу',
    roundCap: 'Раундов ревью на предмет',
    escalationRounds: 'Раундов до эскалации к вам',
    budgets: 'Бюджеты',
    noBudgets: 'Бюджетов нет.',
    budgetRow: (scope: string, usd: string | undefined, time: string | undefined) =>
      `${scope}: ${[usd, time].filter(Boolean).join(', ') || 'без предела'}`,
    onUnknown: 'Если цена неизвестна',
    onUnknownValue: { stop: 'остановиться', continue: 'продолжать' } as Labels,
    timeouts: 'Таймауты',
    runTimeout: 'Прогон попытки',
    lease: 'Аренда контроллера',
    gateFloor: 'Нижняя граница таймаута проверки',
    notSet: 'не задано',
    stall: (quiet: string, stalled: string, action: string, every: string) =>
      `тихо после ${quiet}, зависла после ${stalled} — ${action}; проверка каждые ${every}`,
    stallAction: { stop: 'остановить', report: 'сообщить' } as Labels,
    stallLabel: 'Тишина и зависание',
    lean: 'Слой lean',
    leanState: { on: 'включён', off: 'выключен', unknown: 'неизвестно (нет манифеста)' } as Labels,
    digest: (d: string) => `Дайджест политики: ${d}`,
    clipped: (what: string, n: number) => `${what}: ещё ${n} не показано (предел).`,
  },
  // History.
  history: {
    label: 'История',
    window: (from: string, to: string, bucket: string) =>
      `Окно: с ${from} по ${to}, интервал ${bucket}.`,
    load: 'Нагрузка: пик одновременных попыток',
    loadSummary: (peak: number, slots: number) =>
      `Наибольшая нагрузка за окно: ${peak} одновременно при ${slots} местах.`,
    attempts: 'Начатые и неудачные попытки в час',
    attemptsBucket: 'Начатые и неудачные попытки за интервал',
    attemptsSummary: (started: number, failed: number, peak: number) =>
      `За окно начато попыток: ${started}, неудачных: ${failed}; больше всего начато за час: ${peak}.`,
    attemptsSummaryBucket: (started: number, failed: number, peak: number) =>
      `За окно начато попыток: ${started}, неудачных: ${failed}; больше всего начато за интервал: ${peak}.`,
    gates: 'Проверки: пройденные и не пройденные',
    gatesSummary: (passed: number, failed: number, reused: number) =>
      `За окно пройдено: ${passed}, не пройдено: ${failed}; засчитано по прежнему доказательству: ${reused} (не входит в пройденные).`,
    spend: 'Накопленные расходы против бюджета',
    spendSummary: (end: string, budget: string | undefined) =>
      `К концу окна потрачено ${end}${budget ? ` из бюджета ${budget}` : ''}.`,
    spendOpening: (s: string) => `До начала окна: ${s}.`,
    spendOpeningUnknown:
      'Расходы до начала окна неизвестны: кривая показывает только расходы внутри окна.',
    lowerBound: 'нижняя граница',
    noBudgetLine: 'общего бюджета нет',
    budgetLine: (b: string) => `бюджет ${b}`,
    slotsLine: (n: number) => `мест: ${n}`,
    started: 'начато',
    failed: 'неудачных',
    passed: 'пройдено',
    gateFailed: 'не пройдено',
    reused: 'по прежнему доказательству',
    cumulative: 'накоплено',
    peak: 'пик',
    time: 'Время',
    dataTable: (title: string) => `Данные графика: ${title}`,
    bucketHour: '1 ч',
    misaligned: 'Ряды истории разной длины — график не построен.',
    totals: 'Итоги окна',
    totalsMissing:
      'Итогов окна нет в этой версии harness (они появились в 0.1.0-alpha.56); сводки под графиками сложены из рядов на экране.',
    tStarted: 'Начато попыток',
    tFailed: 'Неудачных попыток',
    tByBucket: (parts: string) => `по причинам: ${parts}`,
    tBucket: (bucket: string, n: number) => `${bucket} — ${n}`,
    tGates: 'Проверки',
    tGatesValue: (passed: number, failed: number, reused: number) =>
      `пройдено ${passed}, не пройдено ${failed}, по прежнему доказательству ${reused}`,
    tRounds: 'Раунды ревью',
    tRoundsValue: (plan: number, contract: number, code: number, attempt: number) =>
      `план ${plan}, контракт ${contract}, код ${code}, в попытках ${attempt}`,
    tSpend: 'Расход за окно',
    tWall: 'Время, когда шли попытки',
    tAttemptMs: 'Сумма времени попыток',
    tPeak: 'Пик нагрузки',
    tPeakValue: (peak: number, slots: number) =>
      `${peak} одновременно при ${slots} ${ruPlural(slots, ['месте', 'местах', 'местах'])}`,
  },
  // Health.
  health: {
    label: 'Здоровье',
    controllerOn: (until: string | undefined) =>
      until ? `Контроллер работает, аренда до ${until}.` : 'Контроллер работает.',
    controllerOff: 'Контроллер не запущен — работа не продвигается.',
    stalledNone: 'Зависших попыток нет.',
    stalled: (n: number) =>
      `${ruPlural(n, ['Зависла', 'Зависли', 'Зависло'])} ${rp(n, 'попытка', 'попытки', 'попыток')}.`,
    quiet: (n: number) => `Тихих попыток: ${n}.`,
    envFailures: (n: number, window: string) => `Сбоев окружения за ${window}: ${n}.`,
    budgets: 'Бюджеты',
    budgetingOff: (spent: string) => `Бюджетов нет; всего потрачено ${spent}.`,
    budgetRow: (
      scope: string,
      spent: string,
      limit: string | undefined,
      state: string,
      time: string | undefined,
    ) =>
      `${scope}: потрачено ${spent}${limit ? ` из ${limit}` : ''}${time ? `; ${time}` : ''}, ${state}.`,
    timeOf: (spent: string, limit: string | undefined) =>
      `время ${spent}${limit ? ` из ${limit}` : ''}`,
    spentTotal: (s: string) => `Всего потрачено: ${s}.`,
    drift: 'Дрейф после приёмки',
    driftCounts: (drifted: number, unavailable: number, checked: number) =>
      `Изменено после приёмки: ${drifted}; не проверено: ${unavailable}; проверено принятых: ${checked}.`,
    warnings: 'Предупреждения',
    noWarnings: 'Предупреждений нет.',
    versions: 'Версии',
    harness: (p: string, v: string) => `harness: ${p} ${v}`,
    ui: (v: string | undefined) => `панель: ${v ?? 'нет сведений'}`,
    view: (v: number, r: number) => `представление: версия ${v}, ревизия ${r}`,
    state: (n: number) => `состояние: версия ${n}`,
    stalledWorks: 'Работы с зависшими или тихими попытками',
  },
};

export type Dict = typeof ru;

const en: Dict = {
  langName: 'English',
  whatItMeans: 'what this means',
  glossary: enGlossary,
  unknown: 'unknown',
  notChecked: 'not checked',
  noData: 'no data',
  noDataInHarness: 'no data in this harness version',
  none: 'none',
  yes: 'yes',
  no: 'no',
  byDefault: 'default',
  listClipped: (n: number) => `${n} more not shown (view limit)`,
  nav: {
    label: 'Panel sections',
    overview: 'Overview',
    reviews: 'Reviews',
    decisions: 'Decisions',
    activity: 'Who did what',
    settings: 'Settings',
    history: 'History',
    health: 'Health',
    back: '← To the overview',
    backTasks: '← To the tasks',
    language: 'Language',
    tasks: 'Tasks',
    journal: 'Log',
    journalLabel: 'Log sections',
  },
  app: {
    title: 'Harness panel',
    loading: 'Loading the harness view…',
    loadingWork: 'Loading the work details…',
    empty: 'There is no state yet — run this first:',
    connectionLost: (e: string) => `Connection lost (${e}). Showing the last view.`,
    newerRevision:
      'The harness sends newer data than this panel knows; update devcontour-harness-ui for full detail.',
    incompatible: 'The panel cannot show this data:',
    notFound: 'There is no such section.',
    readOnly: 'The panel only reads: it starts nothing and answers nothing for you.',
    liveQuestions: (n: number, clipped: boolean) =>
      `${ep(n, 'question waits', 'questions wait')} for your answer${clipped ? ' and possibly more (the list is clipped)' : ''}.`,
    refusal: {
      NOT_A_VIEW: 'The data does not look like a harness view.',
      VIEW_VERSION_UNSUPPORTED: 'This panel does not know this view version.',
      VIEW_UNAVAILABLE: 'The view is not available right now.',
    },
    details: 'Details:',
    skip: 'Skip to content',
    newBuild: (v: string) =>
      `The panel was updated${v ? ` (version ${v})` : ''}: this tab shows the previous build.`,
    reload: 'Reload the page',
  },
  usdUnknown: 'unknown',
  usdOf: (spent: string, limit: string) => `${spent} of ${limit}`,
  ofLimit: (limit: string) => `of ${limit}`,
  duration: (h: number, m: number, s: number) =>
    h
      ? `${h}h ${String(m).padStart(2, '0')}m`
      : m
        ? s
          ? `${m}m ${String(s).padStart(2, '0')}s`
          : `${m}m`
        : `${s}s`,
  hours: (h: number) => `${h} h`,
  days: (d: number) => ep(d, 'day', 'days'),
  typicalRange: (range: string) => `usually ${range}`,
  range: (lo: number, hi: number, unit: string) =>
    lo === hi ? `${hi} ${unit}` : lo === 0 ? `up to ${hi} ${unit}` : `${lo}–${hi} ${unit}`,
  unitMin: 'min',
  unitSec: 's',
  calls: (n: number) => ep(n, 'call', 'calls'),
  stage: {
    queued: 'Queued',
    blocked: 'Waiting on conditions',
    prepare: 'Preparing',
    writer: 'Writing',
    gates: 'Checks',
    review: 'Review',
    integration: 'Integrating',
    input: 'Waiting for an answer',
    stopped: 'Stopped',
    done: 'Accepted locally',
    cancelled: 'Cancelled',
    'plan-review': 'Plan review',
  },
  actor: {
    operator: 'you',
    lead: 'lead agent',
    controller: 'controller',
    host: 'host',
    harness: 'harness',
    writer: 'writer',
    reviewer: 'reviewer',
  },
  liveness: { active: 'moving', quiet: 'quiet', stalled: 'stalled' },
  bucket: {
    defect: 'a defect in the code',
    incomplete: 'the work was not finished',
    integration: 'integration',
    environment: 'environment',
    'time-limit': 'out of time',
    tool: 'tool',
    operator: 'operator action',
    budget: 'budget',
    unknown: 'cause unknown',
    unclassified: 'unclassified',
    input: 'an answer is needed',
  },
  action: {
    none: 'nothing is needed',
    wait: 'wait',
    'review-plan': 'approve the plan',
    retry: 'retry the attempt',
    'diagnose-failure': 'find out why it failed',
    'reset-attempts': 'reset the attempts',
    'raise-budget': 'raise the budget',
    'replan-dependents': 'replan the dependent work orders',
    'recovery-decision': 'decide how to recover the work order',
    'user-decision': 'take a decision',
    'resume-queue': 'resume the queue',
    'fix-environment': 'fix the environment',
    'fix-access': 'fix the access',
    'answer-input': 'answer the question',
    'apply-input': 'apply the answer',
    answer: 'answer the question',
  },
  header: {
    paused: 'the queue is paused',
    running: (n: number) => `${n} working`,
    queued: (n: number) => `${n} waiting in the queue`,
    stopped: (n: number) => `${n} stopped`,
    answer: (n: number) => `answer ${ep(n, 'question', 'questions')}`,
    decide: (n: number) => `take ${ep(n, 'decision', 'decisions')}`,
    and: ' and ',
    maybeMore: ' and possibly more (the list is clipped)',
    waiting: (n: number) => `${n} work order${n === 1 ? ' waits' : 's wait'} for your action`,
    unknownClipped: 'unknown — the list is clipped',
    afterLead: ' (after the lead agent)',
    nothing: 'nothing is needed',
    now: (parts: string) => `Now: ${parts}.`,
    idle: 'Nothing is running now.',
    fromYou: (what: string) => ` From you: ${what}.`,
  },
  live: {
    at: (at: string, same: string | undefined, how: string) =>
      `Data as of ${at}${same ? ` (unchanged since ${same})` : ''} · ${how}`,
    push: 'updates by itself',
    poll: 'checked every 5 seconds',
    snapshot: 'a snapshot; the page updates when the file changes',
    unknownTime: 'an unknown time',
    stale: (since: string, message: string, at: string) =>
      `Could not update the data since ${since}: ${message}. Showing the data as of ${at}; it may be out of date.`,
  },
  footer: (at: string | undefined) =>
    `Harness data as of ${at ?? 'an unknown time'}; the panel changes nothing.`,
  yesterday: (time: string) => `yesterday ${time}`,
  target: {
    unknown: (why: string) => `Accepted locally; remote state unknown${why}.`,
    pushedOn: (ref: string | undefined) =>
      `Accepted locally; already on the remote branch${ref ? ` ${ref}` : ''}.`,
    notPushedOn: (ref: string | undefined) =>
      `Accepted locally; not yet on the remote branch${ref ? ` ${ref}` : ''}.`,
    checkedAt: (when: string) =>
      `Compared with this machine's copy of the remote branch, no network; git updated the copy: ${when}.`,
    checkedAtUnknown:
      "Compared with this machine's copy of the remote branch, no network; when git updated the copy is unknown.",
    noTarget: (sha: string) =>
      `Accepted locally (result ${sha}); remote state unknown: the harness gave no target.`,
    noLocation: 'Accepted; where is unknown: the harness gave no target.',
    notYet: 'Not accepted yet.',
    seeChecks: 'what was checked',
    short: { pushed: 'on the remote', 'not-pushed': 'not on the remote yet' },
    shortUnknown: 'remote state unknown',
  },
  question: {
    youOrLead: 'You or the lead agent can answer this question (technical).',
    onlyYou: 'Only you can answer this question.',
    answeredNotApplied: 'Answered; the lead agent or controller still has to apply the answer.',
    carryStale:
      'The carried-over answer of a replaced question went stale; the lead carries it again or withdraws it.',
    appliedAwaitingClaim: 'Answer applied; waiting for the next attempt to start.',
    delivered: 'Answer delivered to the writer; nothing needs to be done.',
    unknownState: (s: string) => `State ${s}; inspect it before acting.`,
    severity: (n: number) => `severity ${n}`,
    whatChanges: 'What changes:',
    full: 'Full question:',
    version: (n: number) => `version ${n}`,
    answeredBy: (who: string) => `answered by: ${who}`,
    basis: (at: string, line: string) => `${at} — ${line}`,
    cancelled: 'Question withdrawn.',
    superseded: 'Question replaced.',
    leadAnswers:
      'The lead agent answers: the question is technical, and the policy lets the lead answer such questions. You may answer too.',
  },
  story: {
    empty: 'There are no work orders yet.',
    allDone: (done: number, total: number, cancelled: number) =>
      `All work is accepted: ${done} of ${total}${cancelled ? `; ${cancelled} cancelled` : ''}.`,
    allCancelled: (n: number) =>
      `All work orders were cancelled (${n}); nothing is accepted — the lead agent decides what comes next.`,
    harnessDone: (done: number, outside: number) =>
      `All harness work is accepted (${done}); ${ep(outside, 'more task is', 'more tasks are')} not handed to the harness yet — the lead agent hands them over.`,
    onlyOutside: (outside: number) =>
      `The harness has no work orders yet; ${ep(outside, 'task waits', 'tasks wait')} to be handed over by the lead agent.`,
    workAt: (name: string, stage: string) => `${name} (stage “${stage}”)`,
    running: (works: string[], more: number) =>
      `The harness is working on ${works.join(' and ')}${more ? ` and ${ep(more, 'more work order', 'more work orders')}` : ''}.`,
    runningUnlisted: (n: number) =>
      `The harness is working on ${ep(n, 'work order', 'work orders')}.`,
    paused: 'Nothing runs now: the queue is paused.',
    waitsYou: 'Nothing runs now: the work waits for your answer or decision.',
    standing: 'Nothing runs now: the harness is not running.',
    waitsOthers: 'Nothing runs now: the work waits its turn or for the lead agent.',
  },
  problems: {
    kindQueue: 'queue',
    kindStopped: 'stop',
    kindHealth: 'failure',
    kindBudget: 'budget',
    kindDrift: 'changed after acceptance',
    standing:
      'the queue stands: the harness is not running, and after an answer or a reset the work will not go on by itself',
    lastFailure: (attempt: number, plain: string) => `attempt ${attempt} stopped: ${plain}`,
    stoppedNoReason: 'stopped, no reason given',
    writerEnv: (attempt: number) =>
      `attempt ${attempt}: waits for the lead agent — the environment did not let the writer run a required step; the attempt is not counted`,
    stalled: (n: number) => `${ep(n, 'attempt is', 'attempts are')} stalled`,
    environment: (n: number) => `environment failures: ${n}`,
    budgetExceeded: (spent: string, scope: string) => `budget exceeded (${scope}): spent ${spent}`,
    drifted: (n: number) =>
      `${ep(n, 'accepted work order was', 'accepted work orders were')} changed after acceptance`,
  },
  rough: {
    underMinute: 'under a minute',
    minutes: (n: number) => `${n} min`,
    hours: (h: number) => `${h} h`,
    about: (x: string) => `about ${x}`,
    upTo: (x: string) => `up to ${x}`,
    between: (a: string, b: string) => joinRange(a, b, [' min', ' h']),
  },
  eta: {
    stageLeft: (range: string) => `left in this stage: ${range}`,
    stageOver: (max: string) => `the stage takes longer than usual (usually up to ${max})`,
    stageUnknown: 'how long the stage still takes is unknown',
    attempt: (avg: string) => `one attempt takes about ${avg} on average`,
    unknown: 'time unknown',
  },
  tasks: {
    label: 'Tasks',
    title: 'Tasks',
    intro:
      'Each card is one work order: what happens to it now, how many attempts are left, how many review rounds it had and who acts next.',
    empty: 'There are no work orders yet.',
    phase: {
      accepted: 'Accepted',
      cancelled: 'Cancelled',
      running: 'In progress',
      question: 'Waits for an answer',
      stopped: 'Stopped',
      dependency: 'Waits for other work',
      queued: 'Queued',
      other: 'Waiting',
    } as Labels,
    nowRunning: (stage: string, elapsed: string) =>
      `Now: stage “${stage}”${elapsed ? `, for ${elapsed}` : ''}.`,
    nowAccepted: 'Accepted; nothing more is needed for it.',
    nowCancelled: 'Cancelled.',
    nowWaits: (reason: string) => `Now: ${reason}.`,
    nowQueued: 'Now: waits its turn.',
    nowStage: (stage: string) => `Now: stage “${stage}”.`,
    nowWriterEnv:
      'Waits for the lead agent: the environment did not let the writer run a required step. The attempt is not counted.',
    attempts: (used: number, max: number, left: number) =>
      `Attempts: ${used} of ${max} used, ${left} left`,
    reviewRounds: (used: number, max: number | null) =>
      `Code review rounds: ${used}${max !== null ? ` of ${max}` : ''}`,
    noReview: 'No code review yet',
    next: {
      nobody: 'Next: nothing is needed',
      harness: (stage: string) => `Acts next: the harness (stage “${stage}”)`,
      actors: (who: string) => `Acts next: ${who}`,
      dependency: (on: string) => `Next: waits for ${on}`,
      queue: 'Next: waits its turn, nothing is needed',
      unknown: 'Who acts next is unknown',
    },
    questions: (n: number) => `Questions of this task (${n})`,
    waitsOn: (works: string) => `Starts after: ${works}.`,
    open: 'The whole process',
    outside: (n: number) => `Not handed to the harness yet (${n})`,
    otherReviews: (n: number) => `Plan and contract reviews (${n})`,
    reviewsMoved: 'Reviews now live inside the tasks: a review is one stage of the process.',
  },
  timeline: {
    title: 'Process',
    stage: {
      prepare: 'Preparation',
      writer: 'Writing the code',
      gates: 'Checks',
      review: 'Review',
      integration: 'Integration',
      acceptance: 'Acceptance',
    } as Labels,
    state: {
      passed: 'passed',
      failed: 'did not pass',
      current: 'running now',
      ahead: 'ahead',
      skipped: 'not reached',
      next: 'in the next attempt',
      'not-needed': 'not needed',
      unknown: 'outcome unknown',
    } as Labels,
    attempt: (n: number) => `Attempt ${n}`,
    latest: 'latest',
    earlier: (n: number) => `Earlier attempts (${n})`,
    noAttempts: 'No attempt yet: the process starts with preparation.',
    unused: 'not used',
    part: {
      fixed: {
        'dependency-store': 'dependency store',
        prepare: 'preparing the dependencies',
        'integration-prepare': 'preparing the dependencies for integration',
        'writer-dependencies': "the writer's dependencies",
        implementation: 'the writer writes the code',
        'implementation-reuse': 'earlier code reused',
        'candidate-review': 'code review',
        'integration-review': 'integration review',
        'integration-wait': 'waiting for integration',
      } as Labels,
      check: (gate: string) => `check ${gate}`,
      recheck: (gate: string) => `recheck ${gate}`,
      consumerCheck: (gate: string, repo: string) => `check ${gate} in ${repo}`,
      generate: (id: string) => `generating ${id}`,
      port: (port: string) => `port check ${port}`,
      inRepo: (what: string, repo: string) => `${what} in ${repo}`,
      atIntegration: (what: string) => `${what} at integration`,
      environment: {
        setup: 'starting the environment',
        ready: 'environment ready',
        cleanup: 'cleaning up the environment',
      } as Labels,
      environmentOther: 'environment step',
      other: 'another harness step',
    },
    total: (d: string) => `${d} in total`,
    label: (stage: string, state: string, duration: string) =>
      `${stage}: ${state}${duration ? `, ${duration}` : ''}`,
  },
  theme: {
    title: 'Appearance',
    label: 'Theme',
    system: 'Same as the system',
    light: 'Light',
    dark: 'Dark',
    note: 'The choice is kept in this browser only.',
  },
  overview: {
    label: 'Harness overview',
    queueRunning: 'Queue running',
    queuePaused: (reason: string) => `Paused${reason ? ` (${reason})` : ''}`,
    queueWho: (who: string, action: string) => `acts: ${who}${action ? ` — ${action}` : ''}`,
    acceptedOf: (done: number, total: number) => `${done} of ${total} accepted`,
    plan: 'Plan',
    planClipped: 'the work list is clipped — only part of the plan is shown',
    after: (ids: string) => `after ${ids}`,
    needsYou: (n: number) => (n ? `Needed from you (${n})` : 'Needed from you'),
    noQuestions: 'Nothing is needed from you now.',
    unknownQuestionState:
      'Unknown: a question is in a state this panel does not know — see it under “Other questions”.',
    otherQuestions: 'Other questions — already answered, or not yours to answer',
    kindQuestion: 'question',
    unlistedAnswers: (works: string) =>
      `Waiting for your answer, but the question is not in this view: ${works}. Open the work order or run harness input-show.`,
    kindDecision: 'decision',
    why: 'Why:',
    attempts: 'Attempts:',
    leadFirst: (what: string) =>
      `First the lead agent: ${what}. Then you: until then the harness starts no new attempt, and a reset changes nothing.`,
    howAsk: 'How: ask the lead agent, or run it yourself:',
    details: 'details',
    recordSource: {
      blocker: 'reason',
      escalation: 'escalation',
      needs: 'the stage waits for',
    },
    workIds: 'work orders:',
    others: (n: number) => (n ? `Other waits (${n})` : 'Other waits'),
    noOthers: 'Nobody but you has anything to do now.',
    yoursAbove: (n: number) =>
      `Your decisions and questions (${n}) are under “Needed from you” above.`,
    byLead: (n: number) => `The lead agent acts (${n})`,
    leadNote: 'This is for the lead agent, not for you. If nothing changes for long, remind it.',
    byOther: (who: string, n: number) => `The ${who} acts (${n})`,
    byDependency: (n: number) => `Waiting for another work order (${n})`,
    waitsFor: 'waits for',
    nextThere: (who: string) => `on that one, acts: ${who}`,
    then: ', then ',
    nobodyThere: 'on that one, nobody — it just waits its turn',
    runningThere: (stage: string) => `on that one, acts: the harness — stage “${stage}”`,
    waitsThere: 'on that one, nobody — it waits for another work order itself',
    cancelledThere: 'it was cancelled — the lead agent has to replan',
    unknownThere: (stage: string | undefined) =>
      `on that one, who acts is unknown${stage ? ` (stage “${stage}”)` : ' (not in this view)'}`,
    unlistedWaiting: (n: number) =>
      `${n} more work order${n === 1 ? ' waits' : 's wait'} for your action but ${n === 1 ? 'is' : 'are'} not in this view — run harness status.`,
    now: (running: number, slots: number) => `Working now (${running} of ${slots} slots)`,
    nothingRunning: 'Nothing is running.',
    runningUnlisted: (n: number) =>
      `${n} more running work order${n === 1 ? ' is' : 's are'} not listed (view limit).`,
    attemptsShort: (used: number, max: number, left: number) =>
      `attempt ${used} of ${max}, ${left} left`,
    lastStopped: (plain: string) => `the previous one stopped: ${plain}`,
    whoActs: (who: string, action: string) => `acts: ${who} — ${action}`,
    resetCommand: (id: string) =>
      `harness retry --state <state> --work ${id} --reset --reason "<reason>"`,
    waiting: 'Waiting in the queue',
    noWaiting: 'Nothing waits in the queue.',
    accepted: (n: number) => `Accepted (${n})`,
    acceptedUnlisted: (n: number, clipped: boolean) =>
      `${n} accepted work order${n === 1 ? ' has' : 's have'} no location in this view${clipped ? ' (view limit)' : ''}.`,
    budget: 'Budget',
    noBudget: 'no budget',
    budgetUnknown: 'budget unknown',
    spent: (s: string) => `spent ${s}`,
    controller: 'Controller',
    controllerPresent: 'present',
    controllerAbsent: 'absent',
    stalled: 'Stalled attempts',
    drift: 'Changed after acceptance',
    driftNotChecked: (n: number) => `${n} not checked`,
    warnings: 'Harness warnings',
    queueStanding: 'The queue has stopped',
    queueDone: 'All accepted',
    queueHarnessDone: 'All harness work accepted',
    queueCancelled: 'All cancelled',
    legendCancelled: 'cancelled',
    standingWhy: 'the harness is not running, and the queue will not move by itself',
    standingWho: 'the lead agent has to start the harness again',
    scopeTitle: 'The whole scope',
    scopeCounts: (done: number, total: number, running: number, waiting: number) =>
      `Done ${done} of ${total} · in progress ${running} · waiting ${waiting}`,
    scopeOutside: (n: number) => `· not handed to the harness yet: ${n}`,
    scopeCancelled: (n: number) => `· cancelled ${n}`,
    etaNoTotals:
      'How long is left cannot be said yet: this harness version does not report the history window totals (attempt times).',
    legendDone: 'accepted work',
    legendRunning: 'in progress',
    legendWaiting: 'waiting',
    legendOutside: 'not in the harness yet',
    etaNothingLeft: 'No work is left.',
    etaLeft: (range: string, n: number) =>
      `Left: ${range} for ${ep(n, 'work order', 'work orders')} — if one attempt is enough for each; waiting for people's answers is not included.`,
    etaUnknown: (n: number) =>
      `How long is left cannot be said yet: at least ${ep(n, 'attempt', 'attempts')} in the history window are needed to know their usual length.`,
    etaBasis: (avg: string, n: number) =>
      `Estimated from real times: an attempt takes ${avg} on average (over ${ep(n, 'attempt', 'attempts')} started in the history window).`,
    outsideTitle: (n: number) => `Not handed to the harness yet (${n})`,
    outsideState: {
      'not-handed-over': 'not handed to the harness',
      'not-ready': 'waits to be ready',
      'in-harness': 'in the harness',
    } as Labels,
    scopeMissing:
      'Only work orders already handed to the harness are shown: this harness version does not report the other tasks of the run.',
    howAskLead: 'How: ask the lead agent to reset the attempts (the command is under “details”).',
    problems: (n: number) => (n ? `Problems so far (${n})` : 'Problems so far'),
    noProblems: 'No problems so far.',
    stageFor: (elapsed: string) => `for ${elapsed}`,
    command: 'command:',
    unknownAction: 'An action this panel does not know',
    otherSubject: 'not about one work order (see “details”)',
  },
  forecast: {
    label: 'Release forecast',
    release: 'To release',
    time: 'Time',
    percent: (p: number) => `~${p} %`,
    doneWord: 'done',
    leftWord: 'left',
    unknownMark: '?',
    unknownWord: 'unknown',
    basisScope: 'Counted over every task of the run, including ones not handed to the harness yet.',
    basisWorks: 'Counted over harness works only: the run slice of the task tracker is unknown.',
    basisOther: (b: string) => `Counted over: ${b}.`,
    span: (h: number, m: number) => (h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`),
    elapsed: (d: string) => `elapsed ${d}`,
    notStarted: 'not started yet',
    left: (r: string) => `left ${r}`,
    nothingLeft: 'nothing left',
    leftUnknown: 'time left unknown',
    leftUnknownWhy:
      'Why unknown: too few finished attempts yet to know their usual length. It is never shown as zero.',
    basis: (samples: number, perTask: string) =>
      `From ${ep(samples, 'finished attempt', 'finished attempts')}; attempts per accepted task: ${perTask}.`,
    humanWait: (n: number, d: string) =>
      `Waiting for people or the lead now: ${ep(n, 'work', 'works')}, the longest for ${d}. Not in the forecast.`,
    noHumanWait: 'Nobody waits for people or the lead now.',
    harnessSays: 'harness status says the same:',
    notPromise: 'An observation of past attempts, not a promise.',
    timeRing:
      'The «Time» ring: the filled part is elapsed out of «elapsed + left» at the upper end; the light arc is how much more it is at the lower end.',
    releaseText: (line: string) => `To release: ${line}`,
    timeText: (line: string) => `Time: ${line}`,
    none: 'No forecast: the harness gives none for this scope (no works, or all cancelled).',
    fallback:
      "The «To release» and «Time» rings come with devcontour-harness 0.1.0-alpha.60: this harness version sends no forecast. Below are the earlier bar and the panel's rough estimate.",
  },
  r4: {
    queueBy: (who: string) => `starts it: ${who}`,
    scopeClipped: (n: number) =>
      `${ep(n, 'more task', 'more tasks')} of the run slice not shown (view limit); their state is unknown here.`,
    harnessCounts: (done: number, total: number, running: number, waiting: number) =>
      `In harness: accepted ${done} of ${total} · in progress ${running} · waiting ${waiting}`,
    scopeDropped: (n: number) =>
      `The run slice (${ep(n, 'task', 'tasks')}) did not fit into the view: only harness works are shown.`,
    planReview: (works: string[]) =>
      `The harness is reviewing the plan: ${works.join(', ')}; nothing is needed from the lead for it.`,
    leadFirstOrdered: (steps: string) => `First ${steps}. Then you.`,
    actorDoes: (who: string, what: string) => `${who}: ${what}`,
    leadStop: (attempt: number) =>
      `attempt ${attempt}: waits for the lead — the work stopped before a result; the attempt is not counted`,
    nowLeadStop:
      'Waits for the lead: the work stopped before a result. The attempt is not counted.',
    counted: 'the attempt is counted',
    notCounted: 'the attempt is not counted',
    options: 'Answer options:',
    recommended: 'recommended',
    rationale: "The writer's rationale:",
    kindSource: 'tracker question',
    sourceAnswerThere: 'Answered in the task tracker; the panel only shows the question.',
    sourceOpen: (ref: string) => `Open ${ref} in the tracker`,
    sourceRef: (ref: string) => `document ${ref} in the tracker`,
    sourceRecommendation: 'Recommendation:',
    sourceProvisional: 'Until it is answered, the work goes on with a provisional answer:',
    sourceTasks: (keys: string) => `Tasks: ${keys}`,
    sourceReadAt: (when: string) => `Read from the tracker ${when}; not a live read.`,
    sourceClipped: (n: number) =>
      `${ep(n, 'tracker question', 'tracker questions')} more not shown (view limit)`,
    sourcesTitle: 'Task sources',
    sourceLevel: {
      recommended: 'tracker version is the recommended one',
      'below-recommended': 'tracker version is below the recommended one',
    },
    sourceContext: (yes: boolean) =>
      yes ? 'the task context reaches the writer' : 'the task context does not reach the writer',
    sourceContract: (n: number) => `REST contract ${n}`,
    sourceChecked: (when: string) => `checked ${when}`,
    updatesTitle: 'Updates',
    whatsNew: "what's new",
    howToUpdate: 'how to update',
    updateNote: 'The lead or you install it in the project terminal; the panel installs nothing.',
    updatesMode: 'Mode',
    updatesModeNote:
      'The mode is set in .harness/updates.json (harness update); it is only shown here.',
    mode: {
      auto: 'install by itself within safe limits',
      notify: 'only notify',
      off: 'do not check',
    },
    updatesState: 'Last check',
    state: {
      'up-to-date': 'the latest version is installed',
      available: 'a new version is available',
      'needs-decision': 'a version that changes formats is available — the owner decides',
      unavailable: 'the registry did not answer',
      'not-checked': 'not checked yet',
    },
    current: (h: string, ui: string | undefined) =>
      `Installed: devcontour-harness ${h}${ui ? `, panel ${ui}` : ''}`,
    available: (h: string, ui: string | undefined) =>
      `Available: devcontour-harness ${h}${ui ? `, panel ${ui}` : ''}`,
    checkedAt: (when: string) => `checked ${when}`,
    notCheckedYet: 'when it was checked is unknown',
  },
  budgetScope: { total: 'total', group: 'group', work: 'work' },
  budgetState: { within: 'within', exceeded: 'exceeded', undetermined: 'undetermined' },
  blocker: {
    nobody: 'nobody — it just waits its turn, nothing is needed',
    whoActs: (who: string) => `acts: ${who}`,
    noReason: (code: string) => `reason not described (code ${code})`,
    stoppedNoReason: 'no reason given; who acts is unknown',
  },
  work: {
    label: (id: string) => `Work order ${id}`,
    now: 'Now',
    since: (clock: string, elapsed: string) => `since ${clock}, ${elapsed}`,
    next: (stages: string) => `Next: ${stages}.`,
    nothingNext: 'No stages ahead.',
    needs: (who: string, action: string) => `Waits for: ${who} — ${action}.`,
    stages: 'Stages',
    stagePassed: 'passed',
    stageFailed: 'failed',
    stageCurrent: 'in progress',
    stageAhead: 'ahead',
    stageNoOutcome: 'outcome unknown',
    whyRetry: 'Why a retry',
    attemptsLine: (used: number, max: number, left: number) =>
      `Attempt ${used} of ${max} (${left} left).`,
    lastFailure: (n: number, plain: string) => `Attempt ${n} stopped: ${plain}.`,
    failureGroup: (g: string) => `Failure group: ${g}.`,
    failureUnknown: 'Why the previous attempt stopped is unknown.',
    rechecks: (n: number) => `Rechecks: ${n}.`,
    neutral: (used: number, max: number) => `Neutral failures: ${used} of ${max}.`,
    interrupted: (n: number) => `Interrupted at shutdown: ${n} (they use no attempt).`,
    attempts: 'Attempts',
    noAttempts: 'No attempt yet.',
    attemptRow: (n: number) => `Attempt ${n}`,
    attemptStatus: {
      active: 'running',
      running: 'running',
      failed: 'failed',
      expired: 'expired',
      succeeded: 'succeeded',
      done: 'finished',
      cancelled: 'cancelled',
    },
    interruptedRow: 'interrupted at shutdown — uses no attempt',
    startedAt: (at: string) => `started ${at}`,
    finishedAt: (at: string) => `finished ${at}`,
    whatChecked: 'What was checked',
    noVerification: 'No data about checks.',
    emptyVerification: 'No check rows.',
    gate: 'check',
    reviewRow: 'review',
    phase: { candidate: 'candidate', integration: 'integration' },
    result: {
      passed: 'passed',
      failed: 'failed',
      reused: 'counted from an earlier result',
      skipped: 'does not apply',
      'not-run': 'not run yet',
    },
    resultOther: (r: string) => `result ${r}`,
    howExecuted: (n: number | undefined) =>
      n === undefined ? 'ran (attempt unknown)' : `ran in attempt ${n}`,
    howReused: (n: number | undefined) =>
      n === undefined ? 'earlier evidence reused' : `earlier evidence reused (for attempt ${n})`,
    howRead: 'read the diff, ran nothing',
    howNotChecked: 'not checked',
    howUnknown: (h: string) => `method unknown (${h})`,
    by: (who: string) => `by: ${who}`,
    byUnknown: 'by whom — unknown',
    spend: 'Spend',
    spendLine: (usd: string, calls: string, time: string) => `${usd} · ${calls} · ${time}`,
    blockers: 'What is in the way',
    noBlockers: 'Nothing is in the way.',
    questions: 'Questions',
    noQuestions: 'No questions.',
    reviews: 'Reviews of this work',
    noReviews: 'No reviews of this work.',
    accepted: 'Accepted: locally and on the remote',
    drift: 'Drift after acceptance',
    noDriftAccepted: 'The target branch has not moved since acceptance (as the harness read it).',
    noDriftUnknown: 'No drift data: the harness gave no target.',
    notAccepted: 'The work is not accepted yet — there is nothing to drift.',
    detailClipped: (what: string, n: number) => `${what}: ${n} more not shown (limit).`,
    detailUnavailable: 'Work details are not available:',
    clippedName: {
      attempts: 'Attempts',
      findings: 'Findings',
      verification: 'Checks',
      stages: 'Attempt stages',
      reviews: 'Reviews',
      questions: 'Questions',
      blockers: 'Reasons for waiting',
      dependsOn: 'Dependencies',
    },
  },
  drift: {
    row: (ref: string, from: string, to: string) => `${ref}: accepted ${from} → now ${to}`,
    headUnknown: 'tip unknown',
    commits: (n: number) => `commits since: ${n}`,
    files: (n: number) => `files: ${n}`,
    diverged: 'the branch diverged from the accepted result',
    unavailable: (why: string) => `not checked: ${why}`,
  },
  reviews: {
    label: 'Reviews',
    none: 'No reviews yet.',
    kind: { plan: 'plan', contract: 'contract', code: 'code' },
    approved: 'approved',
    notApproved: 'not approved',
    rounds: (used: number, max: number | null) =>
      max === null ? `${used} rounds, no limit` : `rounds ${used} of ${max}`,
    open: (blocking: number, notes: number) => `open: ${blocking} blocking, ${notes} notes`,
    acceptedLimits: (n: number) => `accepted as a limitation: ${n}`,
    reviewer: (who: string) => `reviewer: ${who}`,
    reviewerUnknown: 'reviewer unknown',
    sameVendor: 'same vendor as the writer',
    findings: (n: number) => `Findings (${n})`,
    noFindings: 'No findings.',
    finding: {
      open: 'open',
      closed: 'closed',
      withdrawn: 'withdrawn',
      'accepted-limitation': 'accepted as a limitation',
    },
    findingRounds: (n: number) => `rounds: ${n}`,
    disposition: {
      'accepted-limitation': 'accepted as a limitation',
      continue: 'decided to continue',
    },
    decidedBy: (decision: string, who: string, round: number) =>
      `${decision} · decided by: ${who}, round ${round}`,
    escalation: (requestId: string, findings: string) =>
      `Escalation ${requestId}: ${findings} — the operator decides`,
    escalationAnswered: 'answered',
    escalationOpen: 'not answered yet',
    escalations: (n: number) => `Waiting for a decision (${n})`,
    noEscalations: 'No escalation or stop is waiting for a decision.',
    col: {
      subject: 'Subject',
      kind: 'Kind',
      rounds: 'Rounds',
      open: 'Open',
      accepted: 'Accepted as a limitation',
      reviewer: 'Reviewer',
    },
  },
  decisions: {
    label: 'Decisions',
    missing: 'The producer does not report decisions yet.',
    temporary: (n: number) => `Temporary (${n})`,
    noTemporary: 'No temporary decisions.',
    all: (n: number) => `All decisions (${n})`,
    none: 'No decisions yet.',
    kind: {
      'accepted-limitation': 'finding accepted as a limitation',
      'technical-answer': 'technical question answered',
      continue: 'decided to continue',
    },
    by: (who: string) => `decided by: ${who}`,
    revisit: (when: string) => `revisit: ${when}`,
    revisitUnknown: 'revisit condition unknown',
    reason: (why: string) => `reason: ${why}`,
    reasonMissing: 'no reason recorded',
    about: 'on',
  },
  activity: {
    label: 'Who did what',
    missing: 'This harness version keeps no feed.',
    none: (window: string) => `Nothing happened in the window (${window}).`,
    noneFiltered: 'No events match the chosen filter.',
    window: (window: string) =>
      `Harness events of the last ${window}, newest first. The lines are as the harness wrote them.`,
    windowUnknown:
      'Harness events of the history window, newest first. The lines are as the harness wrote them.',
    filterWork: 'Work order',
    filterActor: 'Who',
    all: 'all',
    shown: (n: number, total: number) => `${n} of ${total} shown`,
    clipped: (n: number) =>
      `${ep(n, 'more event', 'more events')} of the window not shown: the feed keeps the latest 50.`,
    who: 'Who is who',
    accepted: 'where: accepted locally; the remote branch is in the work order detail;',
    openWork: 'open the work order',
  },
  settings: {
    label: 'Settings (read-only)',
    who: 'Who works',
    role: (role: string, repo: string | undefined) =>
      repo ? `role ${role} in repository ${repo}` : `role ${role}`,
    writer: 'writes',
    binding: (runtime: string, model: string | undefined, effort: string | undefined) =>
      [runtime, model, effort ? `effort ${effort}` : undefined].filter(Boolean).join(' · '),
    approvalMode: 'Who approves ordinary stages',
    approval: { agent: 'the lead agent', operator: 'the operator' },
    mode: 'Mode',
    modes: { live: 'real models', fixture: 'fixtures, no models' },
    concurrency: 'Concurrent work orders',
    reviewers: 'Who reviews',
    rule: (kind: string, scope: string) => `${kind}: ${scope}`,
    scope: { global: 'global rule', repository: 'for repository', role: 'for role' },
    scopeOf: (scope: string, id: string | undefined) => (id ? `${scope} ${id}` : scope),
    alternates: (list: string) => `alternates: ${list}`,
    noAlternates: 'no alternates',
    vendor: {
      'different-vendor': 'reviewer from another vendor',
      'same-vendor-allowed': 'same vendor allowed',
    },
    effective: 'Effective code reviewer for each role',
    effectiveFrom: (source: string) => `from: ${source}`,
    effectiveNone: 'no rule found',
    effectiveClipped:
      'The review rule list is clipped: the effective reviewer may come from a rule not shown here.',
    anyRepo: 'in other repositories',
    ask: 'When you are asked',
    threshold: (n: number) =>
      n >= 11
        ? 'Questions do not wait for an answer: the harness runs autonomously (threshold 11).'
        : `Questions of severity ${n} and above wait for an answer.`,
    leadMax: (n: number | undefined) =>
      n === undefined
        ? 'The lead agent answers none of the questions that wait for an answer.'
        : `The lead agent may answer questions up to severity ${n}.`,
    technical: (on: boolean) =>
      `The lead agent decides technical questions: ${on ? 'yes' : 'no'}; questions that change the result for the user always go to you.`,
    criticalPaths: (n: number) => `Critical paths: ${n}.`,
    limits: 'Limits',
    maxAttempts: 'Attempts per work order',
    repairBudget: 'Repair budget',
    maxNeutral: 'Neutral failures per work order',
    roundCap: 'Review rounds per subject',
    escalationRounds: 'Rounds before escalation to you',
    budgets: 'Budgets',
    noBudgets: 'No budgets.',
    budgetRow: (scope: string, usd: string | undefined, time: string | undefined) =>
      `${scope}: ${[usd, time].filter(Boolean).join(', ') || 'no limit'}`,
    onUnknown: 'When a price is unknown',
    onUnknownValue: { stop: 'stop', continue: 'continue' },
    timeouts: 'Timeouts',
    runTimeout: 'Attempt run',
    lease: 'Controller lease',
    gateFloor: 'Check timeout floor',
    notSet: 'not set',
    stall: (quiet: string, stalled: string, action: string, every: string) =>
      `quiet after ${quiet}, stalled after ${stalled} — ${action}; checked every ${every}`,
    stallAction: { stop: 'stop', report: 'report' },
    stallLabel: 'Quiet and stalled',
    lean: 'Lean layer',
    leanState: { on: 'on', off: 'off', unknown: 'unknown (no manifest)' },
    digest: (d: string) => `Policy digest: ${d}`,
    clipped: (what: string, n: number) => `${what}: ${n} more not shown (limit).`,
  },
  history: {
    label: 'History',
    window: (from: string, to: string, bucket: string) =>
      `Window: ${from} to ${to}, bucket ${bucket}.`,
    load: 'Load: peak concurrent attempts',
    loadSummary: (peak: number, slots: number) =>
      `Highest load in the window: ${peak} at once with ${slots} slots.`,
    attempts: 'Attempts started and failed per hour',
    attemptsBucket: 'Attempts started and failed per bucket',
    attemptsSummary: (started: number, failed: number, peak: number) =>
      `In the window ${started} attempts started and ${failed} failed; at most ${peak} started in one hour.`,
    attemptsSummaryBucket: (started: number, failed: number, peak: number) =>
      `In the window ${started} attempts started and ${failed} failed; at most ${peak} started in one bucket.`,
    gates: 'Checks: passed and failed',
    gatesSummary: (passed: number, failed: number, reused: number) =>
      `In the window ${passed} passed and ${failed} failed; ${reused} counted from earlier evidence (not among the passed).`,
    spend: 'Cumulative spend against the budget',
    spendSummary: (end: string, budget: string | undefined) =>
      `By the end of the window ${end} spent${budget ? ` of a ${budget} budget` : ''}.`,
    spendOpening: (s: string) => `Before the window: ${s}.`,
    spendOpeningUnknown:
      'Spend before the window is unknown: the curve shows only spend inside the window.',
    lowerBound: 'lower bound',
    noBudgetLine: 'no total budget',
    budgetLine: (b: string) => `budget ${b}`,
    slotsLine: (n: number) => `slots: ${n}`,
    started: 'started',
    failed: 'failed',
    passed: 'passed',
    gateFailed: 'failed',
    reused: 'earlier evidence',
    cumulative: 'cumulative',
    peak: 'peak',
    time: 'Time',
    dataTable: (title: string) => `Chart data: ${title}`,
    bucketHour: '1 h',
    misaligned: 'History series differ in length — the chart is not drawn.',
    totals: 'Window totals',
    totalsMissing:
      'This harness version sends no window totals (they came in 0.1.0-alpha.56); the chart summaries add up the series on screen.',
    tStarted: 'Attempts started',
    tFailed: 'Attempts failed',
    tByBucket: (parts: string) => `by reason: ${parts}`,
    tBucket: (bucket: string, n: number) => `${bucket} — ${n}`,
    tGates: 'Checks',
    tGatesValue: (passed: number, failed: number, reused: number) =>
      `${passed} passed, ${failed} failed, ${reused} from earlier evidence`,
    tRounds: 'Review rounds',
    tRoundsValue: (plan: number, contract: number, code: number, attempt: number) =>
      `plan ${plan}, contract ${contract}, code ${code}, in attempts ${attempt}`,
    tSpend: 'Spend in the window',
    tWall: 'Time attempts were running',
    tAttemptMs: 'Attempt time added up',
    tPeak: 'Peak load',
    tPeakValue: (peak: number, slots: number) =>
      `${peak} at once with ${ep(slots, 'slot', 'slots')}`,
  },
  health: {
    label: 'Health',
    controllerOn: (until: string | undefined) =>
      until ? `The controller is running, lease until ${until}.` : 'The controller is running.',
    controllerOff: 'The controller is not running — nothing moves.',
    stalledNone: 'No stalled attempts.',
    stalled: (n: number) => `${ep(n, 'attempt', 'attempts')} stalled.`,
    quiet: (n: number) => `Quiet attempts: ${n}.`,
    envFailures: (n: number, window: string) => `Environment failures in ${window}: ${n}.`,
    budgets: 'Budgets',
    budgetingOff: (spent: string) => `No budgets; ${spent} spent in total.`,
    budgetRow: (
      scope: string,
      spent: string,
      limit: string | undefined,
      state: string,
      time: string | undefined,
    ) =>
      `${scope}: ${spent} spent${limit ? ` of ${limit}` : ''}${time ? `; ${time}` : ''}, ${state}.`,
    timeOf: (spent: string, limit: string | undefined) =>
      `time ${spent}${limit ? ` of ${limit}` : ''}`,
    spentTotal: (s: string) => `Spent in total: ${s}.`,
    drift: 'Drift after acceptance',
    driftCounts: (drifted: number, unavailable: number, checked: number) =>
      `Changed after acceptance: ${drifted}; not checked: ${unavailable}; accepted works checked: ${checked}.`,
    warnings: 'Warnings',
    noWarnings: 'No warnings.',
    versions: 'Versions',
    harness: (p: string, v: string) => `harness: ${p} ${v}`,
    ui: (v: string | undefined) => `panel: ${v ?? 'no data'}`,
    view: (v: number, r: number) => `view: version ${v}, revision ${r}`,
    state: (n: number) => `state: version ${n}`,
    stalledWorks: 'Work orders with stalled or quiet attempts',
  },
};

export type Lang = 'ru' | 'en';

export const dictionaries: Readonly<Record<Lang, Dict>> = { ru, en };

/** The dictionary of a language; anything but `en` reads as Russian (RU-first). */
export const dict = (lang: Lang | undefined): Dict => (lang === 'en' ? en : ru);

/** A label from a table; a code this build does not know is shown as is. */
export const label = (table: Record<string, string>, code: string): string =>
  Object.hasOwn(table, code) ? table[code]! : String(code);

/** A label from a table, or `undefined` for a code this build does not know (shown as code). */
export const knownLabel = (table: Record<string, string>, code: string): string | undefined =>
  Object.hasOwn(table, code) ? table[code]! : undefined;
