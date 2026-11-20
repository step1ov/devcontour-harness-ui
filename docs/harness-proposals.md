# Предлагаемые дополнения к devcontour-harness

Это предложения для репозитория harness; в этом репозитории они не
реализуются. Вместе они дают панели оператора ([design.md](design.md)) один
источник данных: только для чтения и с версией. P1 и P2 реализованы в
harness `0.1.0-alpha.55`, P7 и P8 — в `0.1.0-alpha.56` (ревизия
представления 1); схемой представления теперь владеет harness (design.md
§3).

Цель панели — чтобы её понимал оператор без технической подготовки. Панель
показывает данные harness, а не пересказ агента. Поэтому всё, что панель
говорит простыми словами (почему повтор, чего ждёт работа, что и как
проверено), считает и формулирует harness, а панель только выводит.

Предложения опираются на работу alpha.54:

- этап работы в `status`;
- сводки циклов ревью;
- записи `review-code`;
- дрейф принятых целей.

Они также следуют существующим образцам harness:

- чистая проекция плюс загрузчик для node, как у `valueReport` и
  `collectReportInput`;
- один JSON-конверт в stdout;
- те же коды выхода.

Размеры считаются в строках production-кода без сгенерированных схем:
S — до 200, M — 200–600, L — больше 600.

## P1. Проекция `operatorView` и договор (M–L)

**Статус: реализовано в 0.1.0-alpha.55.** Договор, пределы, проекция и JSON
Schema — в harness; `viewVersion: 1` зафиксирована. По сравнению с текстом
ниже: `settings.defaulted` содержит пути представления
(`thresholds.repairBudget`, `timeouts.stall`), в `truncated` добавлены
`budgets`, `blockers`, `dependsOn`, `alternates`, у документа деталей —
`stages`, `reviews`, `questions`, `blockers`, `dependsOn`; строка проверки
получила `phase`, а `by` у выполненного gate — `harness`. Удалённое
состояние цели (`target.remote.state`) в alpha.55 всегда `unknown` с
причиной.

### Договор

`src/contracts/operator-view.ts` содержит:

- Zod-схемы `operatorViewSchema` и `workDetailViewSchema`;
- константы `OPERATOR_VIEW_VERSION = 1` и `OPERATOR_VIEW_REVISION = 0`;
- пределы:
  ```ts
  OPERATOR_VIEW_LIMITS = {
    works: 500, reviews: 50, findingsPerSubject: 50, questions: 50,
    escalations: 50, drift: 50, roles: 100, reviewRules: 100, warnings: 20,
    detailAttempts: 20, buckets: 500, windowMs: 7 days, bytes: 262144,
    activity: 50, decisions: 50, verificationPerWork: 50, dependsOnPerWork: 50,
  };
  ```

`npm run schemas` генерирует JSON Schema
`schemas/operator-view.schema.json`. Набор полей описан в design.md §3.
TypeScript в этом репозитории, `src/model/view.ts`, — черновик.

Окно истории по умолчанию — 24 ч; 7 дней — по запросу (`--window 7d`).
Более длинные окна потребовали бы предварительной агрегации в harness.

### Проекция

`src/projections/operator-view.ts` экспортируется из
`devcontour-harness/projections` и из корня пакета. Она не использует
`node:*` и zod во время выполнения, поэтому модуль projections остаётся
пригодным для браузера.

```ts
export interface OperatorQuestionInput {
  // строит загрузчик, уже очищено
  id: string;
  workId: string;
  kind: 'question';
  state: InputState;
  version: number;
  effectiveSeverity: number;
  createdAt: string;
  text?: string; // сырой текст; проекция маскирует, затем обрезает
  answeredBy?: 'operator' | 'lead' | 'host';
  impact?: 'user-visible' | 'technical'; // P6.4; отсутствие — user-visible
  plainText?: string; // P6.4: «что изменится»; проекция маскирует, затем обрезает до 200
}
export interface OperatorViewInput {
  now: number; // внедрённые часы
  harnessVersion: string;
  stateVersion: number;
  policy: ExecutionPolicyLike; // поля design §3.1
  policyDefaults: readonly string[]; // пути, заполненные по умолчанию
  manifestLayers?: readonly string[]; // profile.layers манифеста проекта
  works: readonly OperatorWorkInput[]; // работа из status + stage + attemptSummaryView
  // + rechecks (доказательства с recheck: true)
  counts: { byStage: Record<string, number> }; // по ВСЕМ работам, до усечения
  reviews: readonly ReviewSubjectSummary[]; // alpha.54 h14 + записи code review
  questions: readonly OperatorQuestionInput[];
  stops: readonly {
    workId?: string;
    subject?: string;
    actor: string;
    action: string;
    code: string;
    since: string;
  }[];
  targets: readonly AcceptedTarget[]; // alpha.54 h10, считает загрузчик
  attempts: readonly AttemptHistoryInput[]; // startedAt, finishedAt, status,
  // корзина сбоя, interrupted, callsRecorded
  gateEvents: readonly {
    at: string;
    passed: boolean;
    applicable: boolean;
    recheck?: boolean;
    reused?: boolean;
  }[];
  calls: ValueReportInput['calls']; // вход вызовов отчёта без изменений,
  // поэтому границы стоимости следуют правилам отчёта
  controller?: { leaseUntil: number };
  budgets: BudgetOverview | undefined; // undefined = бюджеты выключены
  queue: QueueStopView & Partial<QueuePause>;
}
export interface OperatorViewOptions {
  titles?: boolean; // по умолчанию true; false = --no-titles
  windowMs?: number; // по умолчанию 24 ч
  bucketMs?: number; // по умолчанию 15 мин
}
export function operatorView(i: OperatorViewInput, o?: OperatorViewOptions): OperatorView;
export function workDetailView(i: WorkDetailInput, o?: OperatorViewOptions): WorkDetailView;
export function maskText(text: string, max: number): string; // сначала маскировать, затем обрезать
export function viewToken(view: OperatorView | WorkDetailView): string; // sha256
// канонических байтов без generatedAt/token
```

Проекция переиспользует существующий код и ничего не выводит заново:

| Код harness                                                                           | Для чего                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `attemptSummaryOf`, `attemptSummaryView`, `attemptSummaryLine`                        | счётчики попыток и строка сводки                       |
| `workStageOf` (alpha.54 `src/control/stage.ts`)                                       | этап работы; его чистая часть переезжает в projections |
| `queueStop`, `queuePause`, `leadMayAnswer` (alpha.54)                                 | состояние очереди и кто может ответить                 |
| сводки предметов ревью (alpha.54 `src/control/review-summary.ts`)                     | `reviews[]`                                            |
| `failureBucketOf`, `interruptedByShutdown`, `callCostKnown` и границы расходов отчёта | корзины сбоев, прерывания и расходы                    |

Недостающий вход, который отчёт посчитал бы неизвестной стоимостью
(брошенный вызов, неполный usage, попытка без записей вызовов), делает
границу `lower` и никогда не даёт точный ноль.

### Загрузчик

`collectOperatorViewInput(source, options)` в
`src/control/operator-view.ts` работает в node.

Внутри одного `engine.read`, то есть на том же снимке, что и `statusOf`, он
читает:

- работы, попытки и запросы ввода (отображаются в `OperatorQuestionInput`);
- записи вызовов через сбор данных отчёта;
- события gates из журнала событий, отфильтрованные по окну, плюс расходы
  до начала окна;
- локальные записи ревью.

После чтения он:

- запускает git для `acceptedTargets`;
- читает манифест проекта, если он найден рядом с политикой;
- вычисляет `policyDefaults`, сравнивая файл политики с разобранной
  политикой, в которую подставлены значения по умолчанию.

### Тесты (около 500 строк)

- `tests/operator-view.test.ts`:
  - состояния-фикстуры: пустое, занятое, на паузе, бюджет работы превышен
    при общем бюджете в пределах, большие расходы до окна, эскалация,
    дрейф, включая дрейф, который не удалось проверить, все списки усечены;
  - побайтовый детерминизм при фиксированных часах;
  - числа равны `status.works[].attemptSummary`, `stage` и итогам отчёта на
    том же состоянии;
  - ряды gates с пропущенными, переиспользованными, упавшими и
    перепроверенными gates;
  - расходы с брошенными вызовами, неполным usage и попытками без записей
    вызовов.
- `tests/operator-view-secrets.test.ts`: подкладывает ключ провайдера,
  токен `Bearer …`, `user:pass@` и домашний путь в заголовок работы, вопрос,
  находку, ошибку попытки (которая попадает в `queue.detail`) и ошибку git
  (которая попадает в дрейф). В одном случае ключ лежит поперёк границы
  обрезки. Ни одно из значений не должно появиться в `JSON.stringify(view)`.
- `tests/operator-view-limits.test.ts`:
  - документ худшего случая, где каждый список полон и каждая строка на
    пределе, занимает не больше 256 КБ UTF-8;
  - `truncated` считает каждый усечённый список;
  - `VIEW_TOO_LARGE` вместо частичного документа.
- `tests/operator-view-token.test.ts`: токен меняется, когда аренда истекает
  без записи в хранилище, и остаётся тем же для идентичного view.
- Тест схемы, который сверяет вывод с
  `schemas/operator-view.schema.json`.

## P2. `harness view` (S)

**Статус: реализовано в 0.1.0-alpha.55**, с флагом `--lang ru|en`. Флага
`--json` нет: JSON — вывод по умолчанию. Панель использует команду в
маршруте `--state` (design.md §6).

```
harness view --state D --policy F [--work ID] [--no-titles] [--window 24h|7d]
             [--bucket 15m|1h] [--view-version N]
```

- **Только чтение.** Команда никогда не пишет в каталог состояния и не
  создаёт его. Она указана в `capabilities` с `readOnly: true` и схемами
  входа и ответа.
- **stdout.** Конверт `{ ok: true, data: OperatorView | WorkDetailView }`.
  `--human` нет; текстовыми видами остаются `status --human` и
  `explain --human`.
- **Политика.**
  - `--policy` необязателен, только если у состояния есть привязка.
  - Если `--policy` отличается от привязки, view получает предупреждение
    `POLICY_DIGEST_MISMATCH` и не отклоняется.
  - Отсутствующий каталог состояния с `--policy` даёт корректный пустой
    view с настройками из этой политики. Так панель, открытая до первого
    запуска, может сказать «состояния пока нет».
  - Отсутствующий каталог состояния без `--policy` — `POLICY_REQUIRED`
    (выход 2), и ничего не создаётся.
- **Ошибки.**
  - Выход 2: неверный ввод, неизвестный `--view-version`, неизвестный
    `--work`.
  - Выход 3: `STATE_NEWER_THAN_HARNESS`, то же правило, что у `doctor`.
  - Выход 4: инфраструктура или `VIEW_TOO_LARGE`.
- **Изменения в harness.**
  - `view` в `src/cli.ts` с записями в `allowed` и `flags`.
  - Раздел `docs/contracts.md` «OperatorView».
  - Строка README в таблице команд.
  - Одна строка в skill `harness`: «панель оператора читает `harness
view`».
- **Тесты.** Тесты CLI на примере `single-task` с fixture runtime:
  - после `run` view содержит одну работу `done`, чей `resultSha` равен
    значению из `harness result`;
  - `--work` возвращает строки попыток;
  - `--no-titles` не оставляет заголовков;
  - отсутствующее состояние с `--policy` и без него ведёт себя, как описано
    выше, и каталог не создаётся.

## P3. `harness serve-view` (M)

```
harness serve-view --state D --policy F [--port N] [--host 127.0.0.1] [--no-titles]
                   [--static DIR] [--allow-answers]
```

- **Без зависимостей UI.** Используется только `node:http`. `--static DIR`
  по желанию отдаёт заранее собранные файлы из каталога, который называет
  вызывающий. Harness не поставляет UI.
- **Маршруты.** Те же, что у CLI панели (design.md §6), чтобы
  `httpViewSource` работал с обоими. Все — GET или HEAD; всё остальное
  получает 405 до P4.
  - `/api/view`: `ETag` по содержимому из `viewToken`,
    `cache-control: no-store`.
  - `/api/view?work=<id>`
  - `/api/events`: SSE, `event: view` с данными `{ token }` при каждой смене
    токена и heartbeat-комментарий каждые 15 с.
  - `/api/health`: `{ ok, version, viewVersion, readOnly }`.
- **Пересчёт.**
  - `ExecutionView.dataVersion()`, опрашиваемый каждую 1 с, — только
    подсказка для инвалидации.
  - View также пересчитывается каждые 5 с, пока хоть одна работа активна,
    чтобы подхватить истечение аренды и liveness, которые меняются без
    записи в хранилище.
  - Дрейф (git) и состояние в удалённом репозитории (P6.8) кешируются по
    head цели и пересчитываются не чаще раза в 30 с (решение владельца).
  - Событие отправляется только при смене токена содержимого.
- **Сеть.** Привязка только к loopback-адресам, по тем же правилам, что у
  CLI панели:
  - разрешены хосты `127.0.0.1`, `::1` и `localhost`;
  - любой другой хост — `HOST_NOT_LOOPBACK`;
  - чужой заголовок `Host` получает 421;
  - некорректный путь получает 400;
  - отправляются те же заголовки CSP и nosniff.
- **Порт.** Без `--port` перебирает порты начиная с 4791. Занятый явный
  порт — `PORT_BUSY`, выход 4.
- **Вывод при старте.** Одна JSON-строка в stdout, когда сервер слушает:
  `{ ok, url, port, readOnly }`. SIGINT, SIGTERM и EOF на stdin чисто его
  закрывают. EOF на stdin покрывает случай, когда родительский CLI панели
  умер.
- **Без аренды.** Не держит аренду контроллера и никогда не забирает
  работу. Читает так же, как `status`, поэтому может работать рядом с
  `harness run`.
- **Тесты.**
  - На состоянии-фикстуре `/api/view` равен выводу `harness view`.
  - Событие SSE приходит после `pause`.
  - Событие SSE приходит после истечения аренды без записи в хранилище.
  - Отказы loopback, Host и 400.
  - 405 на POST без `--allow-answers`.
  - Работает одновременно с `run` без конфликта аренды.

## P4. Ответы оператора через `serve-view` (S–M, после S2 в UI)

Транспорт (design.md §9):

- Браузер говорит только с CLI панели, который проксирует в `serve-view`.
- `serve-view --allow-answers` читает 32-байтовый общий секрет из stdin
  первой строкой. Секрет генерирует CLI панели. Он никогда не появляется в
  argv, окружении или stdout.
- Запись принимается только при выполнении всех условий:
  - `Authorization: Bearer <secret>`;
  - `Origin` равен origin, который CLI панели передаёт вместе с секретом;
  - `content-type: application/json`;
  - тело не больше 16 КБ.

```
GET  /api/questions/<id>   → { requestId, version, state, severity, answerableBy,
                               impact, text (маскирован, без обрезки до 8 КБ),
                               options[{ id, label, consequence, plain }] }
POST /api/answers          { requestId, requestVersion,
                             kind: 'clarification' | 'requirement-change',
                             optionId?, text }
```

- **Обработка ответа.** Обработчик вызывает тот же код, что и `harness
input-answer --actor operator --request-version V --kind K [--option O]
--text T`:
  - `text` обязателен.
  - Устаревшие версии отклоняются.
  - `OPERATOR_ANSWER_REQUIRED` сохраняет свой смысл.
  - `--actor lead` на этом пути никогда не принимается.
  - Отвечать можно только на запросы в `awaiting-answer`.
- **Тесты.**
  - Каждый отказ:
    - секрета нет или он неверный;
    - неверный `Origin`;
    - тело не JSON;
    - тело больше 16 КБ;
    - устаревшая версия;
    - запрос, на который уже ответили;
    - запрос, на который может ответить только ведущий.
  - Успешный ответ записывает `answeredBy: operator` и `kind`.
  - Секрет никогда не появляется в журналах или ответах.
- Дизайн записи (одноразовый код, cookie, секрет через stdin) утверждает
  владелец отдельно, до начала P4.

## P5. Документация и каталог (S)

- `docs/contracts.md`: новый раздел «OperatorView» с правилами версий
  (design.md §4), пределами и правилами маскирования.
- `capabilities`: записи для `view` и `serve-view`.
- `ROADMAP.md`: одна запись «Operator view» с критериями выше. Она называет
  этот пакет и не ссылается на его внутренности.

## P6. Поля для понятной панели

Оператор без технической подготовки должен понимать, почему работа
повторяется, чего она ждёт, что и как проверено, где лежит принятый
результат и кто что делал. Эти тексты harness формирует сам, по
фиксированным шаблонам и с маскированием (design.md §9). Панель их только
показывает и ничего не перефразирует. Если поля нет, панель говорит «нет
сведений», а не ноль и не «всё в порядке».

Все поля ниже, кроме `blockers[]`, необязательны в view: производитель
заполняет их, когда его harness уже даёт эти данные. `blockers[]` уже
обязателен в черновике и меняет только форму записи (P6.2). Пределы строк —
таблица в design.md §3.10.

Тексты `plain` harness пишет по фиксированным шаблонам на языке опции
проекции `lang: 'ru' | 'en'` (`harness view --lang`; без флага — `ru`).
Детали из внешнего вывода не переводятся. Панель передаёт язык интерфейса
(`GET /api/view?lang=`, design.md §6); `serve-view --lang` — вместе с P3.
Пункты P1 вошли в harness **0.1.0-alpha.55**. Пункты P2 — в следующие
релизы, номер пока не назначен.

### P6.1. Последний сбой попытки (P1, alpha.55, S)

- **Что.** Строка этапа в `status` говорит, почему идёт повтор, например:
  «попытка 3 из 6; прошлая остановлена: окружение — порт занят».
- **Источник.** Последняя упавшая попытка работы: корзина из
  `failureBucketOf`, деталь из ошибки попытки.
- **Поле view.** `works[].attempts.lastFailure {attempt, bucket, plain, at?}`.
  `bucket` — корзина `failureBucketOf`. `plain` — фиксированный шаблон для
  корзины плюс маскированная и обрезанная деталь, всего до 160 символов.

### P6.2. Понятные причины ожидания (P1, alpha.55, S)

- **Что.** Для каждого кода блокировки движка — простой текст и тот, кто
  должен действовать. Для `queued` и `DEPENDENCY_INCOMPLETE` текст такой:
  «просто ждёт очереди — ничего не нужно».
- **Источник.** Коды `engine.blockers` и таблица текстов в harness.
- **Поле view.** `works[].blockers[] {code, plain?, actor}`. `actor` — кто
  должен действовать; `null` означает «никто». Это **заменяет** прежнее
  `blockers: string[]` в черновике view 1. View 1 ещё не выпущен; он
  фиксируется только с выходом P1.

### P6.3. Что проверено и как (P1, alpha.55, M)

- **Что.** Для каждой проверки работы — результат и способ. Строка ревью
  честно говорит «прочитал diff, ничего не запускал». Голого «проверено»
  нет нигде.
- **Источник.** Доказательства `attempt.gate`, переиспользованные
  доказательства кандидата, записи ревью.
- **Поле view.** `WorkDetailView.verification[] {gate, kind: gate|review,
result: passed|failed|reused|skipped|not-run,
how: executed|reused|read|not-checked, by?, attempt?, at?}`. Предел — 50
  строк на работу. `executed` требует `by` и `attempt`, `reused` —
  `attempt`; строка ревью никогда не `executed`; идущий gate — `not-run` /
  `not-checked` до завершения.

### P6.4. Влияние вопроса и технические ответы ведущего (P1, alpha.55, M)

- **Что.**
  - Вопросы исполнителя получают `impact: user-visible | technical`, а
    каждый вариант ответа — простое «что изменится для пользователя».
  - Политика по желанию: `inputPolicy.leadAnswers.technical: true`
    разрешает ведущему отвечать на технические вопросы с записанной
    причиной. Причина видна в отчёте и в решениях view (P6.10).
  - Вопросы, меняющие результат для пользователя (`user-visible`), всегда
    остаются за оператором, при любом флаге.
  - `harness init` спрашивает об этом флаге.
  - Skill `harness` добавляет одну строку простого объяснения и никогда не
    переформулирует варианты.
- **Источник.** Запрос ввода исполнителя, политика.
- **Поля view.** `questions[].impact?`, `questions[].plain?` (маскирован,
  до 200 символов), `settings.thresholds.leadAnswersTechnical?`. Когда флаг
  включён, `answerableBy` для технических вопросов становится
  `operator-or-lead`. Отсутствующий `impact` читается как `user-visible`, и
  `impact` сильнее правила по severity: не-`technical` вопрос остаётся за
  оператором при любой severity.

### P6.5. Skill запускает панель (P1, alpha.55, S)

- **Что.** В начале долгого запуска skill `harness` запускает панель
  (skill `harness-ui`) и даёт пользователю URL. Если панель недоступна —
  предлагает `status --watch`.
- **Источник.** Только текст skill; данных не добавляет.

### P6.6. Лента действий (P2, S–M)

**Статус: реализовано в 0.1.0-alpha.57** (ревизия представления 2): лента
— из записей, которые представление уже читает (попытки, проверки, раунды
ревью, вопросы и ответы); `actor` — `controller`, `writer`, `reviewer`,
`lead`, `operator`, `host`; `truncated.activity` — опущенные в окне. Лента
осталась в обзорном документе.

- **Что.** Кто что делал: ведущий ↔ harness, writer, reviewer,
  контроллер, оператор.
- **Источник.** Журнал событий, новые сверху, окно — окно истории (24 ч по
  умолчанию, 7 дней с `--window 7d`).
- **Поле view.** `activity[] {at, actor, action, workId?, subject?, plain}`,
  предел 50. Открытое решение: остаётся ли лента в обзорном документе или
  переезжает в свой маршрут документа.

### P6.7. Наблюдаемое время этапов (P2, S)

- **Что.** Сколько обычно занимает этап, по уже завершённым этапам этого
  состояния.
- **Поле view.** `works[].stage.typical {p50Ms, p90Ms, samples}`. Поля нет,
  если образцов меньше минимума (предложено 5; открытое решение design.md
  §11). Показывается как диапазон и никогда как
  обещание.

### P6.8. Принято локально / в удалённом репозитории (P2, S)

**Статус: реализовано в 0.1.0-alpha.57** (ревизия 2): `remote.state`
настоящий, плюс `checkedAt` (время reflog копии ветки) и готовая строка
`line` на языке представления. Только локальные ref, config и reflog, без
сети.

- **Что.** Есть ли принятый результат только локально или уже в удалённом
  репозитории.
- **Источник.** Только локальная remote-tracking ref, без `fetch`. Кеш по
  head на 30 с вместе с дрейфом. Skill предлагает push; harness никогда не
  делает push сам.
- **Поле view.** `works[].target {repositoryId, ref, acceptedSha?,
remote: {state: pushed|not-pushed|unknown, trackingRef?, reason?}}`.

### P6.9. План выполнения (P2, S)

- **Что.** Полоса плана: порядок работ, зависимости, где идёт работа
  сейчас.
- **Источник.** Граф; порядок — порядок `status`.
- **Поле view.** `works[].dependsOn?: string[]`.

### P6.10. Решения и временные решения (P2, M)

- **Что.** Какие решения приняты, кем и какие из них временные.
  `accept-limitation --revisit <условие>` отмечает решение как временное с
  условием пересмотра. В отчёте появляется раздел решений.
- **Источник.** Решения по находкам, технические ответы ведущего (P6.4).
- **Поле view.** `decisions[] {id, kind: accepted-limitation|technical-answer|continue,
by: lead|operator, at, workId?, subject?, findingId?, requestId?,
temporary, revisit?, title?, reason?}`, предел 50. Тексты маскируются и
  обрезаются. Обязательные сочетания: `temporary` требует `revisit`,
  `technical-answer` — `requestId` и `reason`, `accepted-limitation` —
  `findingId` (design.md §3.9).

### P6.11. Объём приёмки (P2, S)

- **Что.** Необязательное поле поручения `acceptanceScope` (например,
  end-to-end или только вёрстка) и предупреждение plan-check, когда
  работа, видимая пользователю, принимается только по вёрстке.
- **Поле view.** Позже, отдельной ревизией.

### P6.12. Руководство оператора на русском (P2, S)

- **Что.** `docs/operator-guide.md` в harness: термины и действия простыми
  словами. Панель ссылается на него из раскрытий «что это значит».

## P7. Итоги окна истории (S)

> Реализовано в harness `0.1.0-alpha.56`: `history.totals` с теми же
> числами, а также `failuresByBucket`, `reviewRounds`, `spendUsd`, `wallMs`
> и `attemptMs`. Панель показывает их на экране истории (design.md §3.7).

Текстовые сводки графиков истории (S2) сейчас суммируют ряды `history` в
панели: начатые и неудачные попытки, пройденные, проваленные и повторно
использованные gates, пик нагрузки. Предложение: `history.totals
{attemptsStarted, attemptsFailed, gatesPassed, gatesFailed, gatesReused,
loadPeak}` в проекции, чтобы и эти числа приходили из harness. Добавление
— новая ревизия представления.

## P8. Токен изменений без часов проекции (S)

> Реализовано в harness `0.1.0-alpha.56`: токен — SHA-256 содержимого без
> часов проекции. С ревизии 1 панель берёт `source.token` как идентичность
> содержимого и считает свой дайджест только для alpha.55 (design.md §6).

`source.token` в `0.1.0-alpha.55` хеширует и `history.from`/`history.to`, а
окно истории заканчивается в `now` с точностью до миллисекунды. Поэтому
токен разный при каждом запуске `harness view` над неизменным состоянием, и
по нему нельзя заметить «ничего не изменилось» (§3.10 design.md обещает
равенство токенов для равного представления). Панель S3 пока считает
собственный дайджест: без `generatedAt` и `source.token`, с границами окна,
обрезанными до минуты (`digestOf` в `src/server/serve.ts`).

Предложение: исключить границы окна из канонических байтов токена или
выравнивать конец окна по границе интервала (`bucketMs`), чтобы токен
менялся только вместе с содержимым. Тест: два запуска над одним состоянием
с разными часами внутри одного интервала дают один токен.

## P9. Строка удалённой ветки не теряет состояние при обрезке (S)

`target.remote.line` (alpha.57) обрезается до 200 символов целиком. Имя
удалённой ветки стоит в середине строки «принято локально; в удалённой
ветке <имя> ещё нет», поэтому при имени длиннее ~160 символов обрезка
срезает «ещё нет», и строка читается как утвердительная. Панель поэтому
строку не цитирует, а пишет состояние из `remote.state` и `trackingRef`.

Предложение: обрезать имя ветки внутри строки (с «…»), а слова состояния
сохранять всегда; или ставить состояние в начало строки. Тест: ветка из
300 символов — строка ≤ 200 и кончается словами состояния.

## P10. Весь объём прогона в представлении (S–M, alpha.59/60)

Сделано в harness 0.1.0-alpha.60 (`scope`, ревизия 4); панель alpha.5 его читает.

Владелец хочет видеть весь объём работ, а не только работы, уже
переданные в harness. Панель alpha.4 читает необязательный раздел
`scope` и без него пишет, что видит только работы harness.

Предлагаемая форма (дополнение ревизии, необязательное поле):

```
scope?: {
  total?: number,          // все задачи среза прогона, если список обрезан
  tasks: {
    id: string,            // id задачи во внешнем трекере
    title?: string,        // маскируется и обрезается, как titles работ
    workId?: string,       // работа harness, если задача уже передана
    state: 'in-harness' | 'not-handed-over' | 'not-ready',
    plain?: string,        // почему не передана — на языке представления
  }[]
}
```

Тест: срез из трёх задач, одна передана в harness — `scope.tasks`
перечисляет все три, у переданной есть `workId`; `progress` по-прежнему
считает только работы harness.

## P11. Оценка оставшегося времени в harness (S)

Сделано в harness 0.1.0-alpha.60 (`forecast`, ревизия 4); панель alpha.5
рисует его двумя кругами, свой расчёт оставлен только для ревизий 0–3.

Панель alpha.4 считает примерный срок сама (§5.1 дизайна): остаток этапа
из `stage.typical`, средняя попытка из `history.totals`, остаток объёма как
диапазон между параллельным и последовательным выполнением. Предложение:
harness выдаёт `progress.estimate { loMs, hiMs, basis, samples }` по своим
наблюдениям (с учётом зависимостей и `typical` каждого этапа), а панель
только пишет его словами. Пока поля нет, остаётся расчёт панели.

## P12. Полный текст вопроса (S)

Сделано в harness 0.1.0-alpha.60 (`questions[].options`, `rationale`).

В представлении у вопроса есть `title` и `plain`, но нет вариантов ответа,
рекомендации и обоснования, которые видны в `harness input-show`. Панель
alpha.4 показывает вопрос без команды (F-Y), но варианты взять неоткуда.
Предложение: `questions[].options?: {id, label, recommended?}[]` и
`questions[].rationale?` (маскируются и обрезаются, 200).

## P13. Причина остановки и засчитанность в представлении (S)

Сделано в harness 0.1.0-alpha.60 в виде `lastFailure.kind` и `counted`
(без `attempts[].counted` в деталях работы).

С alpha.59 исполнитель, которому песочница закрыла обязательный шаг,
останавливается с причиной `writer-environment`, и попытка не
засчитывается. В представлении нет ни причины, ни признака «не засчитано»:
панель alpha.4 узнаёт такую остановку по неизменной фразе harness в
`lastFailure.plain` вместе с `stage.needs` ведущего; смена фразы в harness
сломает это распознавание.
Предложение: `attempts.lastFailure.cause?` (`writer-environment`, …) и
`attempts.lastFailure.counted: boolean`, а в деталях работы —
`attempts[].counted`.

## Порядок и зависимости

1. Работа alpha.54 слита: этап h12, цикл ревью h14, h10 review-code и
   дрейф.
2. Harness **0.1.0-alpha.55** несёт P6.1–P6.5.
3. P1 и P2 (`operatorView` и `harness view`) выходят вместе в одном релизе.
4. P3 выходит в следующем релизе.
5. P5 выходит вместе с P1–P3.
6. P6.6–P6.12 — после P3.
7. P4 — только после экранов S2 в UI и после того, как владелец утвердит
   дизайн записи.
