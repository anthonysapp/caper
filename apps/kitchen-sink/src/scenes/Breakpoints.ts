import BaseScene from '@/scenes/BaseScene';
import { CaperColors } from '@/theme';
import { FONT_BODY } from '@/utils/Constants';
import { FlexContainer, UICanvas, defineScene } from '@caper/core';
import { Text } from 'pixi.js';

export const scene = defineScene({
  id: 'breakpoints',
  debug: {
    group: 'Framework',
    label: 'Breakpoints',
  },
});

/**
 * Worked example for `app.breakpoints` (see `BreakpointPlugin`). Drag the
 * window from narrow to wide to see all three wiring styles in action:
 *
 * - `bp.onChange` drives `_refresh` — it fires only when a name actually
 *   flips, never on every resize tick, so the readout stays cheap.
 * - `bp.value({ mobile: 1, tablet: 2, desktop: 3, wide: 4 })` cascades a
 *   column count for the box row down from the current tier.
 * - `bp.when('stacked', ...)` runs immediately if already stacked and
 *   again on every subsequent entry — used here to count entries, a job
 *   `_refresh`'s `bp.is('stacked')` check alone can't do.
 */
export default class BreakpointsScene extends BaseScene {
  protected readonly title = 'Breakpoints';
  protected readonly subtitle = 'Demonstrates app.breakpoints: value(), is()/when(), and onChange.';

  ui: UICanvas;
  container: FlexContainer;
  readout: Text;
  boxRow: FlexContainer;

  _stackedEntries = 0;

  async initialize() {
    await super.initialize();

    this.ui = this.add.uiCanvas({ useAppSize: true });

    this.container = this.ui.addElement(
      this.make.flexContainer({
        flexDirection: 'column',
        gap: 30,
        alignItems: 'center',
        layout: { width: '100%', paddingLeft: 30, paddingRight: 30 },
      }),
      { align: 'center' },
    );

    this.readout = this.container.add.text({
      text: '',
      resolution: 2,
      style: { fill: 0xffffff, fontFamily: FONT_BODY, fontSize: 20, align: 'center', lineHeight: 28 },
    });

    this.boxRow = this.container.add.flexContainer({
      gap: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
    });

    const bp = this.app.breakpoints;

    this.addSignalConnection(bp.onChange.connect(() => this._refresh()));
    this.addSignalConnection(
      bp.when('stacked', () => {
        this._stackedEntries++;
        this._refresh();
      }),
    );

    this._refresh();
  }

  _refresh() {
    const bp = this.app.breakpoints;
    const columns = bp.value({ mobile: 1, tablet: 2, desktop: 3, wide: 4 }) ?? 1;
    const stacked = bp.is('stacked');

    this.readout.text = [
      `tier: ${bp.current}`,
      `orientation: ${bp.orientation}`,
      `pointer: ${bp.pointer}`,
      `stacked: ${stacked}`,
      `columns: ${columns}`,
      `stacked entries: ${this._stackedEntries}`,
    ].join('\n');

    this._layoutBoxes(columns, stacked);
  }

  _layoutBoxes(columns: number, stacked: boolean) {
    this.boxRow.flexDirection = stacked ? 'column' : 'row';
    this.boxRow.removeChildren();
    for (let i = 0; i < columns; i++) {
      this.boxRow.add
        .graphics({ layout: { width: 64, height: 64 } })
        .rect(0, 0, 64, 64)
        .fill({ color: CaperColors.olive });
    }
    this.boxRow.updateLayout();
    this.ui.updateLayout();
  }

  resize() {
    super.resize();
    this.ui.updateLayout();
  }
}
