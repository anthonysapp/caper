import { extensions } from 'pixi.js';
import { Plugin } from '../Plugin';
import { Spine, spineLoaderExtension, spineTextureAtlasLoader } from './pixi-spine';

export class SpinePlugin extends Plugin {
  public readonly id = 'SpinePlugin';

  public async initialize() {
    extensions.add(spineTextureAtlasLoader);
    extensions.add(spineLoaderExtension);
    // SpinePipe and DarkTintBatcher register themselves at module scope in ./pixi-spine
    (window as any).Spine = Spine;
  }
}
