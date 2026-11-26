// View revision 11 (harness 0.1.0-alpha.73): thin mode
// (`settings.harnessMode.mode: thin`) and the writer session of an attempt
// in the work detail (`attempts[].writerSession`: fresh, resumed, fallback).
// The fields are typed in view.ts and checked by the gate; these accessors
// only say «absent» for an older harness or another mode. Pure: no React.

import type { AttemptRow, OperatorView, WriterSession } from './view.ts';

export type { WriterSession } from './view.ts';

/** Thin mode (revision 11); `false` for light, strict or an older harness. */
export function isThinMode(view: Pick<OperatorView, 'settings'>): boolean {
  return view.settings.harnessMode?.mode === 'thin';
}

/** The writer session of an attempt; `undefined` outside thin mode or for an older harness. */
export function writerSessionOf(row: Pick<AttemptRow, 'writerSession'>): WriterSession | undefined {
  return row.writerSession;
}
