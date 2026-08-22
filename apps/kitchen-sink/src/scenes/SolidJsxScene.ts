// Plain TS on purpose: the caper vite preset parses `src/scenes/**` with
// `jsx: false`, so all JSX lives in `../solid-demo/`. `compose()` returning
// `SceneView(this)` is just a function call, which the parser is fine with —
// the JSX is on the other side of that call.

import { SceneView } from '@/solid-demo/View';
import { CaperColors } from '@/theme';
import { FONT_BODY, FONT_DISPLAY } from '@/utils/Constants';
import { defineScene } from '@caperjs/core';
import { ComposableScene, type Composes } from '@caperjs/solid';

export const scene = defineScene({
  id: 'solid-jsx-prototype',
  debug: {
    group: 'Framework',
    label: 'Solid JSX',
  },
});

export default class SolidJsxScene extends ComposableScene implements Composes {
  /**
   * Imperative setup still works exactly as it always did. Everything built
   * here survives the compose mount — Solid appends, it doesn't take over.
   */
  public async initialize() {
    this.add.text({
      text: 'SOLID JSX — compose()',
      style: { fontFamily: FONT_DISPLAY, fontSize: 32, fill: CaperColors.olive },
      x: -this.app.size.width * 0.5 + 40,
      y: -this.app.size.height * 0.5 + 60,
    });
    this.add.text({
      text: 'The scene declares its members by returning JSX. Mounted once on `added()`; signals do the rest.',
      style: { fontFamily: FONT_BODY, fontSize: 15, fill: CaperColors.textDim },
      x: -this.app.size.width * 0.5 + 40,
      y: -this.app.size.height * 0.5 + 102,
    });
  }

  public compose() {
    return SceneView(this);
  }
}
