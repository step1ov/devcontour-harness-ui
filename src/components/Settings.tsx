// Settings screen (read-only): who works, who reviews, when you are asked,
// limits, budgets, timeouts, the lean layer. Every value has its unit; the
// "default" mark appears only for paths in `settings.defaulted`. For each
// role (and repository) the effective code reviewer and where it comes from
// are shown, by the harness resolution role -> repository -> global.
// Revision 6: «Кто принимает решения» first — the harness's own summary and
// explanations of the attempt limit and the recovery rule.

import { RadioGroup } from './ui/radio-group.tsx';
import { dict, knownLabel, label, type Dict, type Lang } from '../model/dict.ts';
import { Alert } from './ui/alert.tsx';
import { formatDuration, usd } from '../model/format.ts';
import type { Binding, OperatorView, ReviewRuleView, RoleBinding } from '../model/view.ts';
import { Clipped, Heading, type ScreenProps } from './common.tsx';
import { UpdatesSection } from './Updates.tsx';
import { instantMs } from '../model/compat.ts';
import { hasOverview, SetupScreen } from './Setup.tsx';

/** Theme choice of the viewer: follow the system, or light, or dark. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface SettingsProps extends Pick<ScreenProps, 'lang'> {
  view: OperatorView;
  /**
   * The viewer's theme and its setter. Without `onThemeChange` (a host that
   * owns the theme) the appearance block is not shown.
   */
  theme?: ThemeChoice;
  onThemeChange?: (theme: ThemeChoice) => void;
}

const bindingText = (b: Binding, t: Dict) => t.settings.binding(b.runtime, b.model, b.effort);

/**
 * The code-review rule in force for a role binding: a role rule (for this
 * repository, or for any), then the repository rule, then the global rule.
 * `undefined` when the view lists none (e.g. the list was clipped).
 */
export function effectiveCodeReview(
  rules: ReviewRuleView[],
  r: Pick<RoleBinding, 'role' | 'repositoryId'>,
): ReviewRuleView | undefined {
  const code = rules.filter((x) => x.kind === 'code');
  return (
    code.find(
      (x) => x.scope === 'role' && x.role === r.role && x.repositoryId === r.repositoryId,
    ) ??
    code.find((x) => x.scope === 'role' && x.role === r.role && x.repositoryId === undefined) ??
    (r.repositoryId !== undefined
      ? code.find((x) => x.scope === 'repository' && x.repositoryId === r.repositoryId)
      : undefined) ??
    code.find((x) => x.scope === 'global')
  );
}

/**
 * Role and repository pairs to show the effective code reviewer for: each
 * role binding, plus each repository a code-review rule names, plus "other
 * repositories" for each role. Display work over the listed rules only.
 */
export function reviewPairs(
  roles: RoleBinding[],
  rules: ReviewRuleView[],
): { role: string; repositoryId?: string }[] {
  const repos = new Set<string>();
  for (const r of roles) if (r.repositoryId) repos.add(r.repositoryId);
  for (const r of rules) if (r.kind === 'code' && r.repositoryId) repos.add(r.repositoryId);
  const out: { role: string; repositoryId?: string }[] = [];
  const seen = new Set<string>();
  const add = (role: string, repositoryId?: string) => {
    const k = role + '\0' + (repositoryId ?? '');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(repositoryId === undefined ? { role } : { role, repositoryId });
  };
  for (const role of new Set(roles.map((r) => r.role))) {
    add(role);
    for (const repo of [...repos].sort()) add(role, repo);
  }
  return out;
}

export function Settings({ view, lang = 'ru', theme = 'system', onThemeChange }: SettingsProps) {
  const t = dict(lang);
  // A document without the overview lists (revision 5 setup): the setup state, not a throw.
  if (!hasOverview(view)) return <SetupScreen view={view} lang={lang} />;
  const v = t.settings;
  const s = view.settings;
  const th = s.thresholds;
  const isDefault = (path: string) =>
    s.defaulted.some((d) => d === path || path.startsWith(d + '.'));
  const row = (term: string, value: string, path?: string) => (
    <div className="hui-def" key={term}>
      <dt>{term}</dt>
      <dd>
        {value}
        {path && isDefault(path) ? (
          <span className="hui-badge hui-default" data-testid={`default-${path}`}>
            {t.byDefault}
          </span>
        ) : null}
      </dd>
    </div>
  );
  const scopeText = (r: ReviewRuleView) =>
    v.scopeOf(
      label(v.scope, r.scope),
      [r.role, r.repositoryId].filter(Boolean).join(' / ') || undefined,
    );
  const badge = (path: string) =>
    isDefault(path) ? (
      <span className="hui-badge hui-default" data-testid={`default-${path}`}>
        {t.byDefault}
      </span>
    ) : null;
  const pairs = reviewPairs(s.roles, s.reviews);
  const rulesClipped = Boolean(view.truncated?.reviewRules || view.truncated?.roles);
  return (
    <section className="hui hui-settings" aria-labelledby="hui-settings-title" lang={lang}>
      <Heading t={t} level={2} id="hui-settings-title">
        {v.label}
      </Heading>

      {onThemeChange ? (
        <div className="hui-panel" data-testid="settings-theme">
          <Heading t={t}>{t.theme.title}</Heading>
          <RadioGroup
            value={theme}
            onChange={onThemeChange}
            label={t.theme.label}
            options={[
              { value: 'system', label: t.theme.system },
              { value: 'light', label: t.theme.light },
              { value: 'dark', label: t.theme.dark },
            ]}
          />
          <p className="hui-muted">{t.theme.note}</p>
        </div>
      ) : null}

      <DecisionsPanel view={view} lang={lang} />

      {view.updates ? (
        <div className="hui-panel" data-testid="settings-updates">
          <Heading t={t}>{t.r4.updatesTitle}</Heading>
          <UpdatesSection updates={view.updates} lang={lang} now={instantMs(view.generatedAt)} />
        </div>
      ) : null}

      <div className="hui-panel" data-testid="settings-who">
        <Heading t={t} term="writer">
          {v.who}
        </Heading>
        <dl className="hui-defs">
          {s.roles.map((r) =>
            row(`${v.role(r.role, r.repositoryId)} — ${v.writer}`, bindingText(r.writer, t)),
          )}
          {row(v.approvalMode, label(v.approval, s.approvalMode), 'approvalMode')}
          {row(v.mode, label(v.modes, s.mode), 'mode')}
          {row(v.concurrency, String(s.concurrency), 'concurrency')}
        </dl>
        <Clipped n={view.truncated?.roles} t={t} />
      </div>

      <div className="hui-panel" data-testid="settings-reviewers">
        <Heading t={t} term="review">
          {v.reviewers}
        </Heading>
        <ul className="hui-list">
          {s.reviews.map((r, i) => (
            <li key={i} className="hui-item">
              <strong>{v.rule(label(t.reviews.kind, r.kind), scopeText(r))}</strong> —{' '}
              {bindingText(r.reviewer, t)};{' '}
              {r.alternates.length
                ? v.alternates(r.alternates.map((b) => bindingText(b, t)).join(', '))
                : v.noAlternates}
              ; {label(v.vendor, r.vendor)}
            </li>
          ))}
        </ul>
        <Clipped n={view.truncated?.reviewRules} t={t} />
        <h4 className="hui-minor">{v.effective}</h4>
        <ul className="hui-list" data-testid="settings-effective">
          {pairs.map((r, i) => {
            const rule = effectiveCodeReview(s.reviews, r);
            return (
              <li key={i} className="hui-item">
                {r.repositoryId === undefined && pairs.some((p) => p.repositoryId !== undefined)
                  ? `${v.role(r.role, undefined)} ${v.anyRepo}`
                  : v.role(r.role, r.repositoryId)}
                :{' '}
                {rule
                  ? `${bindingText(rule.reviewer, t)} (${v.effectiveFrom(scopeText(rule))})`
                  : `${v.effectiveNone} (${t.noData})`}
              </li>
            );
          })}
        </ul>
        {rulesClipped ? <p className="hui-warn-text">{v.effectiveClipped}</p> : null}
      </div>

      <div className="hui-panel" data-testid="settings-ask">
        <Heading t={t} term="technical">
          {v.ask}
        </Heading>
        <ul className="hui-list">
          <li>
            {v.threshold(th.inputSeverity)} {badge('thresholds.inputSeverity')}
          </li>
          <li>
            {v.leadMax(th.leadAnswersMaxSeverity)} {badge('thresholds.leadAnswersMaxSeverity')}
          </li>
          <li data-testid="settings-technical">
            {v.technical(th.leadAnswersTechnical === true)}{' '}
            {badge('thresholds.leadAnswersTechnical')}
          </li>
          <li>
            {v.criticalPaths(th.criticalPaths)} {badge('thresholds.criticalPaths')}
          </li>
        </ul>
      </div>

      <div className="hui-panel" data-testid="settings-limits">
        <Heading t={t} term="attempt">
          {v.limits}
        </Heading>
        <dl className="hui-defs">
          {row(v.maxAttempts, String(th.maxAttempts), 'thresholds.maxAttempts')}
          {row(v.repairBudget, String(th.repairBudget), 'thresholds.repairBudget')}
          {row(v.maxNeutral, String(th.maxNeutralFailures), 'thresholds.maxNeutralFailures')}
          {row(v.roundCap, String(th.reviewRoundCap), 'thresholds.reviewRoundCap')}
          {row(
            v.escalationRounds,
            String(th.reviewEscalationRounds),
            'thresholds.reviewEscalationRounds',
          )}
        </dl>
      </div>

      <div className="hui-panel" data-testid="settings-budgets">
        <Heading t={t} term="lowerBound">
          {v.budgets}
        </Heading>
        {s.budgets.length ? (
          <ul className="hui-list">
            {s.budgets.map((b, i) => (
              <li key={i}>
                {v.budgetRow(
                  label(t.budgetScope, b.scope),
                  b.usd !== undefined ? usd(b.usd) : undefined,
                  b.timeMs !== undefined ? formatDuration(b.timeMs, lang) : undefined,
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hui-muted">{v.noBudgets}</p>
        )}
        <Clipped n={view.truncated?.budgets} t={t} />
        <dl className="hui-defs">
          {row(
            v.onUnknown,
            s.budgetOnUnknown !== undefined ? label(v.onUnknownValue, s.budgetOnUnknown) : t.noData,
            'budgetOnUnknown',
          )}
        </dl>
      </div>

      <div className="hui-panel" data-testid="settings-timeouts">
        <Heading t={t} term="stalled">
          {v.timeouts}
        </Heading>
        <dl className="hui-defs">
          {row(
            v.runTimeout,
            formatDuration(s.timeouts.runTimeoutMs, lang),
            'timeouts.runTimeoutMs',
          )}
          {row(v.lease, formatDuration(s.timeouts.leaseMs, lang), 'timeouts.leaseMs')}
          {row(
            v.gateFloor,
            s.timeouts.gateTimeoutFloorMs !== undefined
              ? formatDuration(s.timeouts.gateTimeoutFloorMs, lang)
              : v.notSet,
            'timeouts.gateTimeoutFloorMs',
          )}
          {row(
            v.stallLabel,
            v.stall(
              formatDuration(s.timeouts.stall.quietMs, lang),
              formatDuration(s.timeouts.stall.stalledMs, lang),
              label(v.stallAction, s.timeouts.stall.action),
              formatDuration(s.timeouts.stall.intervalMs, lang),
            ),
            'timeouts.stall',
          )}
          {row(v.lean, label(v.leanState, s.lean.state), 'lean')}
        </dl>
      </div>

      <footer className="hui-muted hui-footer">
        {v.digest(s.policyDigest)} · {t.app.readOnly}
      </footer>
    </section>
  );
}

/** A setting value in words: booleans and the recovery modes in the panel language, the rest as is. */
export function decisionValueText(value: number | boolean | string, lang: Lang): string {
  const t = dict(lang);
  if (typeof value === 'boolean') return value ? t.yes : t.no;
  if (typeof value === 'string') return knownLabel(t.r6.decisionValue, value) ?? value;
  return String(value);
}

/**
 * «Кто принимает решения» (`settings.decisions`, view revision 6): the
 * harness's summary sentence, an unusual combination as a warning, and each
 * setting with its value, where the value comes from and the harness's own
 * explanation in the panel language. Before revision 6: nothing to show.
 */
export function DecisionsPanel({ view, lang = 'ru' }: { view: OperatorView; lang?: Lang }) {
  const t = dict(lang);
  const k = t.r6;
  const d = view.settings.decisions;
  const pick = (b: { ru: string; en: string }) => (lang === 'en' ? b.en : b.ru);
  if (!d) return null;
  return (
    <div className="hui-panel" data-testid="settings-decisions">
      <Heading t={t} term="lead">
        {k.decisionsTitle}
      </Heading>
      <p className="hui:font-medium" data-testid="decisions-summary">
        {k.decisionsSummary} {pick(d.summary)}
      </p>
      {d.warning ? (
        <Alert tone="warn" data-testid="decisions-warning" role="note">
          {pick(d.warning)}
        </Alert>
      ) : null}
      <dl className="hui-defs">
        {d.items.map((x) => (
          <div className="hui-def" key={x.key} data-testid={`decision-${x.key}`}>
            <dt>{knownLabel(k.decisionKey, x.key) ?? x.key}</dt>
            <dd>
              <strong>{decisionValueText(x.value, lang)}</strong>{' '}
              <span className="hui-badge hui-default" data-source={x.source}>
                {knownLabel(k.decisionSource, x.source) ?? x.source}
              </span>
              <span className="hui:mt-1 hui:block hui:text-sm hui:text-muted-foreground">
                {pick(x.explain)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
