// devcontour-harness-ui — React components over the harness operator view.
// Styles: import 'devcontour-harness-ui/styles.css' once in the host. The
// copied shadcn/ui pieces and their Radix primitives are bundled into this
// package (dist/lib/vendor): a host needs React only.

export * from './model/index.ts';
export { Overview, type OverviewProps } from './components/Overview.tsx';
export { WorkDetail, verificationWords, type WorkDetailProps } from './components/WorkDetail.tsx';
export { Reviews, type ReviewsProps } from './components/Reviews.tsx';
export { Tasks, type TasksProps } from './components/Tasks.tsx';
export { Timeline, partName } from './components/Timeline.tsx';
export { Decisions, type DecisionsProps } from './components/Decisions.tsx';
export { Activity, type ActivityFilter, type ActivityProps } from './components/Activity.tsx';
export {
  Settings,
  effectiveCodeReview,
  type SettingsProps,
  type ThemeChoice,
} from './components/Settings.tsx';
export {
  History,
  HistoryTotalsPanel,
  cumulativeSpend,
  perHour,
  type HistoryProps,
} from './components/History.tsx';
export { Health, type HealthProps } from './components/Health.tsx';
export {
  ForecastRings,
  remainingWords,
  sinceMs,
  spanWords,
  timeState,
} from './components/Forecast.tsx';
export { UPDATE_BANNER_STATES, UpdatesBanner, UpdatesSection } from './components/Updates.tsx';
export { SourceQuestionItem, SourceReviewItem } from './components/Overview.tsx';
export { SetupNote, SetupScreen, hasOverview, inSetup, stageLines } from './components/Setup.tsx';
export { Term, type ScreenProps } from './components/common.tsx';
