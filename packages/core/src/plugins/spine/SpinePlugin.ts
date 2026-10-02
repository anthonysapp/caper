import { extensions } from 'pixi.js';
import { Plugin } from '../Plugin';
import { Spine, spineLoaderExtension, SpinePipe, spineTextureAtlasLoader } from './pixi-spine';
import { DarkTintBatcher } from './pixi-spine/darktint/DarkTintBatcher';

export class SpinePlugin extends Plugin {
  public readonly id = 'SpinePlugin';

  public async initialize() {
    extensions.add(spineTextureAtlasLoader);
    extensions.add(spineLoaderExtension);
    // Registered here, not left to the module-scope `extensions.add` calls in
    // ./pixi-spine: package.json declares `"sideEffects": false`, so a production
    // bundler drops those imports and the first Spine on stage throws inside
    // `renderer.render()`, killing the ticker. `extensions.add` de-dupes by name,
    // so the module-scope calls (still live in dev) are harmless.
    extensions.add(SpinePipe);
    extensions.add(DarkTintBatcher);
    (window as any).Spine = Spine;
  }
}
