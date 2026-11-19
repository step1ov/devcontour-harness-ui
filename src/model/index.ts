// devcontour-harness-ui/model — view types, compatibility gate and data
// adapters without React. Hosts import this to build or check a view.

export * from './view.ts';
export {
  checkView,
  checkWorkDetail,
  KNOWN_VIEW_REVISION,
  type ViewCheck,
  type WorkDetailCheck,
} from './compat.ts';
export {
  httpViewSource,
  liveEventOf,
  staticViewSource,
  STREAM_SILENCE_MS,
  type EventSourceFactory,
  type EventSourceLike,
  type HttpViewSourceOptions,
  type LiveEvent,
  type SubscribeOptions,
  type ViewSource,
} from './source.ts';
export {
  KNOWN_QUESTION_STATES,
  SLOT_STAGES,
  formatDuration,
  formatElapsed,
  leadMayAnswer,
  formatUsd,
  formatWindow,
  usd,
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
  targetSentence,
  type HeaderCounts,
  type Lang,
} from './i18n.ts';
export { dict, dictionaries, label, type Dict, type GlossaryId } from './dict.ts';
