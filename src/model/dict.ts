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
  | 'waitsQueue';

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
};

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
    language: 'Язык',
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
    liveQuestions: (n: number) => `Ждут вашего ответа: ${rp(n, 'вопрос', 'вопроса', 'вопросов')}.`,
    skip: 'К содержимому',
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
  typicalRange: (lo: string, hi: string) => `обычно ${lo}–${hi}`,
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
    nothing: 'ничего не нужно',
    now: (parts: string) => `Сейчас: ${parts}.`,
    idle: 'Сейчас ничего не выполняется.',
    fromYou: (what: string) => ` От вас: ${what}.`,
  },
  footer: (at: string | undefined) =>
    `Данные harness на ${at ?? 'неизвестное время'}; панель ничего не меняет.`,
  target: {
    pushed:
      'Принято локально; в удалённом репозитории — да (по последнему обновлению git на этой машине).',
    notPushed:
      'Принято локально; в удалённом репозитории — ещё нет (по последнему обновлению git на этой машине).',
    unknown: (why: string) => `Принято локально; в удалённом репозитории — неизвестно${why}.`,
    noTarget: (sha: string) =>
      `Принято локально (результат ${sha}); в удалённом репозитории — неизвестно: harness не сообщил цель.`,
    noLocation: 'Принято; где — неизвестно: harness не сообщил цель.',
    notYet: 'Ещё не принято.',
    seeChecks: 'что проверено',
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
  },
  // Overview.
  overview: {
    label: 'Обзор harness',
    queueRunning: 'Очередь идёт',
    queuePaused: (reason: string) => `Очередь на паузе${reason ? ` (${reason})` : ''}`,
    acceptedOf: (done: number, total: number) => `принято ${done} из ${total}`,
    plan: 'План',
    planClipped: 'список работ обрезан — показана только часть плана',
    after: (ids: string) => `после ${ids}`,
    needsYou: (n: number) => `Нужен ваш ответ (${n})`,
    noQuestions: 'Вопросов, которые ждут вас, нет.',
    otherQuestions: 'Другие вопросы',
    now: (running: number, slots: number) => `Сейчас в работе (${running} из ${slots} мест)`,
    nothingRunning: 'Сейчас ничего не выполняется.',
    runningUnlisted: (n: number) =>
      `Ещё ${rp(n, 'работа', 'работы', 'работ')} в работе не показаны (предел представления).`,
    attemptsShort: (used: number, max: number, left: number) =>
      `попытка ${used} из ${max}, осталось ${left}`,
    lastStopped: (plain: string) => `прошлая остановлена: ${plain}`,
    decisions: (n: number) => `Ждут решения (${n})`,
    noDecisions: 'Решений от вас и ведущего сейчас не ждут.',
    whoActs: (who: string, action: string) => `действует: ${who} — ${action}`,
    waiting: 'Ждут очереди / Остановлены',
    noWaiting: 'Ничто не ждёт и не остановлено.',
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
      `${decision} · решил: ${who}, раунд ${round}`,
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
      'accepted-limitation': 'принял ограничение',
      'technical-answer': 'ответил на технический вопрос',
      continue: 'решил продолжать',
    } as Labels,
    revisit: (when: string) => `вернуться: ${when}`,
    revisitUnknown: 'условие пересмотра неизвестно',
    reason: (why: string) => `причина: ${why}`,
    reasonMissing: 'причина не записана',
    about: 'по',
  },
  // Activity.
  activity: {
    label: 'Кто что делал',
    missing: 'Производитель пока не ведёт ленту.',
    none: 'Событий в окне нет.',
    filterWork: 'Работа',
    filterActor: 'Исполнитель',
    all: 'все',
    shown: (n: number, total: number) => `показано ${n} из ${total}`,
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
    budgetRow: (scope: string, spent: string, limit: string | undefined, state: string) =>
      `${scope}: потрачено ${spent}${limit ? ` из ${limit}` : ''}, ${state}.`,
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
    language: 'Language',
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
    liveQuestions: (n: number) => `${ep(n, 'question waits', 'questions wait')} for your answer.`,
    skip: 'Skip to content',
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
  typicalRange: (lo: string, hi: string) => `usually ${lo}–${hi}`,
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
    nothing: 'nothing is needed',
    now: (parts: string) => `Now: ${parts}.`,
    idle: 'Nothing is running now.',
    fromYou: (what: string) => ` From you: ${what}.`,
  },
  footer: (at: string | undefined) =>
    `Harness data as of ${at ?? 'an unknown time'}; the panel changes nothing.`,
  target: {
    pushed: 'Accepted locally; on the remote (as of the last git update on this machine).',
    notPushed:
      'Accepted locally; not on the remote yet (as of the last git update on this machine).',
    unknown: (why: string) => `Accepted locally; remote state unknown${why}.`,
    noTarget: (sha: string) =>
      `Accepted locally (result ${sha}); remote state unknown: the harness gave no target.`,
    noLocation: 'Accepted; where is unknown: the harness gave no target.',
    notYet: 'Not accepted yet.',
    seeChecks: 'what was checked',
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
  },
  overview: {
    label: 'Harness overview',
    queueRunning: 'Queue running',
    queuePaused: (reason: string) => `Paused${reason ? ` (${reason})` : ''}`,
    acceptedOf: (done: number, total: number) => `${done} of ${total} accepted`,
    plan: 'Plan',
    planClipped: 'the work list is clipped — only part of the plan is shown',
    after: (ids: string) => `after ${ids}`,
    needsYou: (n: number) => `Needs your answer (${n})`,
    noQuestions: 'No questions are waiting for you.',
    otherQuestions: 'Other questions',
    now: (running: number, slots: number) => `Working now (${running} of ${slots} slots)`,
    nothingRunning: 'Nothing is running.',
    runningUnlisted: (n: number) =>
      `${n} more running work order${n === 1 ? ' is' : 's are'} not listed (view limit).`,
    attemptsShort: (used: number, max: number, left: number) =>
      `attempt ${used} of ${max}, ${left} left`,
    lastStopped: (plain: string) => `the previous one stopped: ${plain}`,
    decisions: (n: number) => `Waiting for a decision (${n})`,
    noDecisions: 'No decision is waiting for you or the lead.',
    whoActs: (who: string, action: string) => `acts: ${who} — ${action}`,
    waiting: 'Waiting / Stopped',
    noWaiting: 'Nothing waits and nothing is stopped.',
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
      'accepted-limitation': 'accepted a limitation',
      'technical-answer': 'answered a technical question',
      continue: 'decided to continue',
    },
    revisit: (when: string) => `revisit: ${when}`,
    revisitUnknown: 'revisit condition unknown',
    reason: (why: string) => `reason: ${why}`,
    reasonMissing: 'no reason recorded',
    about: 'on',
  },
  activity: {
    label: 'Who did what',
    missing: 'The producer does not keep a feed yet.',
    none: 'No events in the window.',
    filterWork: 'Work order',
    filterActor: 'Actor',
    all: 'all',
    shown: (n: number, total: number) => `${n} of ${total} shown`,
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
    budgetRow: (scope: string, spent: string, limit: string | undefined, state: string) =>
      `${scope}: ${spent} spent${limit ? ` of ${limit}` : ''}, ${state}.`,
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
