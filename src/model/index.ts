// devcontour-harness-ui/model — view types, compatibility gate and data
// adapters without React. Hosts import this to build or check a view.

export * from './view.ts';
export { checkView, KNOWN_VIEW_REVISION, type ViewCheck } from './compat.ts';
export { httpViewSource, staticViewSource, type ViewSource } from './source.ts';
export { formatElapsed, formatUsd, stageLabel } from './format.ts';
