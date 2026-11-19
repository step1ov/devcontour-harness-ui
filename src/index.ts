// devcontour-harness-ui — React components over the harness operator view.
// Styles: import 'devcontour-harness-ui/styles.css' once in the host.

export * from './model/index.ts';
export { Overview, type OverviewProps } from './components/Overview.tsx';
export { WorkDetail, verificationWords, type WorkDetailProps } from './components/WorkDetail.tsx';
export { Reviews, type ReviewsProps } from './components/Reviews.tsx';
export { Decisions, type DecisionsProps } from './components/Decisions.tsx';
export { Activity, type ActivityFilter, type ActivityProps } from './components/Activity.tsx';
export { Settings, effectiveCodeReview, type SettingsProps } from './components/Settings.tsx';
export {
  History,
  HistoryTotalsPanel,
  cumulativeSpend,
  perHour,
  type HistoryProps,
} from './components/History.tsx';
export { Health, type HealthProps } from './components/Health.tsx';
export { Term, type ScreenProps } from './components/common.tsx';
