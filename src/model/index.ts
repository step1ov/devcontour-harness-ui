// devcontour-harness-ui/model — view types, compatibility gate and data
// adapters without React. Hosts import this to build or check a view.

export * from './view.ts';
export { checkView, KNOWN_VIEW_REVISION, type ViewCheck } from './compat.ts';
export { httpViewSource, staticViewSource, type ViewSource } from './source.ts';
export {
  KNOWN_QUESTION_STATES,
  SLOT_STAGES,
  formatElapsed,
  leadMayAnswer,
  formatUsd,
  questionStatus,
  stageLabel,
  type QuestionStatus,
} from './format.ts';
export {
  footerSentence,
  formatClock,
  headerSentence,
  langOf,
  pickLang,
  ruPlural,
  type HeaderCounts,
  type Lang,
} from './i18n.ts';
