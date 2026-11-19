// Settings screen (read-only): who works, who reviews, when you are asked,
// limits, budgets, timeouts, the lean layer. Every value has its unit; the
// "default" mark appears only for paths in `settings.defaulted`. For each
// role (and repository) the effective code reviewer and where it comes from
// are shown, by the harness resolution role -> repository -> global.

import { dict, label, type Dict } from '../model/dict.ts';
import { formatDuration, usd } from '../model/format.ts';
import type { Binding, OperatorView, ReviewRuleView, RoleBinding } from '../model/view.ts';
import { Clipped, Heading, type ScreenProps } from './common.tsx';

export interface SettingsProps extends Pick<ScreenProps, 'lang'> {
  view: OperatorView;
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

export function Settings({ view, lang = 'ru' }: SettingsProps) {
  const t = dict(lang);
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
    v.scopeOf(label(v.scope, r.scope), r.role ?? r.repositoryId);
  return (
    <section className="hui hui-settings" aria-labelledby="hui-settings-title" lang={lang}>
      <Heading t={t} level={2} id="hui-settings-title">
        {v.label}
      </Heading>

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
          {s.roles.map((r, i) => {
            const rule = effectiveCodeReview(s.reviews, r);
            return (
              <li key={i} className="hui-item">
                {v.role(r.role, r.repositoryId)}:{' '}
                {rule
                  ? `${bindingText(rule.reviewer, t)} (${v.effectiveFrom(scopeText(rule))})`
                  : `${v.effectiveNone} (${t.noData})`}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="hui-panel" data-testid="settings-ask">
        <Heading t={t} term="technical">
          {v.ask}
        </Heading>
        <ul className="hui-list">
          <li>{v.threshold(th.inputSeverity)}</li>
          <li>{v.leadMax(th.leadAnswersMaxSeverity)}</li>
          <li data-testid="settings-technical">{v.technical(th.leadAnswersTechnical === true)}</li>
          <li>{v.criticalPaths(th.criticalPaths)}</li>
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
