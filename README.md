# devcontour-harness-ui

Панель оператора для [devcontour-harness](https://github.com/step1ov/devcontour-harness),
только для чтения. Пакет состоит из двух частей:

- библиотека React-компонентов;
- небольшое самостоятельное приложение, которое локальный CLI раздаёт на
  `127.0.0.1`.

Обе части показывают _операторское представление_ harness (operator view):
один версионированный JSON-документ, который harness вычисляет из своего
состояния и политики. Панель не вычисляет собственных чисел.

Цель панели — понятность без технической подготовки. Панель показывает
данные harness, а не пересказ агента: что ждёт вашего ответа, что идёт
сейчас, как именно проверена работа и где лежит принятый результат.

> Статус: `0.1.0-alpha.2`. Все экраны только для чтения: обзор, детали
> работы, ревью, решения, кто что делал, настройки, история и здоровье, на
> русском и английском. Данные — файл представления или живой
> `harness view` (`--state`, harness `0.1.0-alpha.55` и новее). Схемой
> представления владеет harness; см. [предложения для harness](docs/harness-proposals.md).
> С harness `0.1.0-alpha.56` (ревизия представления 1) панель показывает,
> кто и почему ответил на вопрос, итоги окна истории и замечает изменения по
> токену harness. С `0.1.0-alpha.57` (ревизия 2) — ещё ленту «кто что
> делал» и есть ли принятая работа в удалённой ветке (по копии ветки на этой
> машине, без сети). С alpha.55 и alpha.56 всё прочее работает, как раньше.
> [Дизайн](docs/design.md) описывает схему, экраны, безопасность и этапы;
> изменения — в заметках к выпускам [0.1.0-alpha.2](docs/release-notes/0.1.0-alpha.2.md)
> и [0.1.0-alpha.1](docs/release-notes/0.1.0-alpha.1.md).

## Язык

Интерфейс двуязычный, русский — полноправный язык. `--lang ru|en`, по
умолчанию язык берётся из системной локали (`LC_ALL`, `LC_MESSAGES`,
`LANG`); на странице — `?lang=ru|en` и переключатель в навигации. Тот же
язык уходит в harness (`harness view --lang`), поэтому тексты harness
приходят на языке подписей. Документация на русском, идентификаторы в
коде — на английском.

## Быстрый старт

Нужен Node.js ≥ 24.3. Установите панель рядом с harness проекта (точная
версия, как и у harness):

```sh
npm install --save-dev --save-exact devcontour-harness@0.1.0-alpha.57 devcontour-harness-ui@0.1.0-alpha.2
npx devcontour-harness-ui --demo --lang ru      # демонстрационные данные
# → {"ok":true,"url":"http://127.0.0.1:4790/","port":4790,"readOnly":true,...}
```

Откройте напечатанный URL. Чтобы показать настоящий проект, панель сама
вызывает установленный harness и передаёт язык интерфейса. Открытая
страница обновляется сама: пока она открыта, панель замечает изменения
каталога состояния и перепроверяет `harness view` (2–15 с, не реже 5 с,
пока идут попытки) и присылает изменения по SSE; без открытой страницы и
при скрытой вкладке harness не запускается. Над экраном — строка «Данные на
HH:MM» и предупреждение, если обновить данные не удалось:

```sh
npx devcontour-harness-ui --state <state> --policy .harness/policy.json \
  --harness node_modules/.bin/harness
```

Или запишите снимок и раздайте файл (деталей работ у снимка нет); при
перезаписи файла открытая страница обновится:

```sh
npx harness view --state <state> --policy .harness/policy.json > view.json   # конверт тоже принимается
npx devcontour-harness-ui --view view.json
```

Разделы — hash-адреса: `#/` обзор, `#/work/<id>` детали работы,
`#/reviews`, `#/decisions`, `#/activity`, `#/settings`, `#/history`,
`#/health`.

Флаги CLI:

- `--view <file>`, `--demo` или `--state <dir>` с `--policy <file>` и
  `--harness <bin>` (по умолчанию `harness` из PATH); harness без `view` —
  отказ `HARNESS_VIEW_UNAVAILABLE`;
- `--port N` (точный порт; занятый порт — ошибка). Без флага перебираются
  порты 4790–4809.
- `--host`, только loopback: `127.0.0.1`, `::1` или `localhost`. Всё
  остальное отклоняется.
- `--lang ru|en` — язык, когда страница не запросила свой (`?lang=`).
- `--window 24h|7d` — окно истории для `--state` (по умолчанию окно harness,
  24 ч).
- `--check [--harness <bin>] [--state <dir> [--policy <file>]]` — печатает
  `{harness, ui, viewVersion, compatible, fix?}`; выход 0 — совместимо, 3 —
  нет.

В stdout печатается одна строка JSON, подсказки идут в stderr. Коды
выхода: 0, 2 (ввод), 3 (отказ) и 4 (инфраструктура).

Разработка из checkout:

```sh
npm install
npm test && npm run typecheck && npm run build
npm run test:e2e           # Playwright при 1280 и 390 px, axe; нужен локальный Chromium Playwright
npm run check              # всё вместе: typecheck, prettier, unit, сборка, e2e
node dist/lib/cli.js --demo
```

Skill [`skills/harness-ui/SKILL.md`](skills/harness-ui/SKILL.md) позволяет
ведущему агенту проекта запустить панель и объяснить её пользователю.

## Встраивание

```tsx
import { Overview, WorkDetail, Reviews, Settings, History, Health } from 'devcontour-harness-ui';
import 'devcontour-harness-ui/styles.css';

<Overview view={view} lang="ru" onOpenWork={(id) => navigate(id)} />;
<WorkDetail detail={detail} lang="ru" workHref={(id) => `?work=${id}`} />;
```

Экраны: `Overview`, `WorkDetail` (документ `harness view --work <id>`),
`Reviews`, `Decisions`, `Activity`, `Settings`, `History`, `Health`. У всех
`lang` (по умолчанию `ru`), `timeZone`, `now` и навигация `onOpenWork` или
`workHref`.

- Компоненты получают представление пропом и ничего не загружают сами.
- Хост реализует `ViewSource` поверх своего хранилища.
- Оформление задаётся CSS-переменными `--hui-*` на элементе-предке.

`devcontour-harness-ui/model` экспортирует типы, `checkView` и источники
данных без React.

## Безопасность

- Только loopback, без способа это отключить.
- Заголовок `Host` должен называть loopback-адрес слушателя.
- Только GET и HEAD.
- Строгий CSP.
- Нет телеметрии и исходящих запросов.

Представление не содержит промптов, логов, токенов и абсолютных путей; см.
дизайн, §9.

## Лицензия

MIT
