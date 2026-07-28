import type { Application } from '../core/Application';
import type { Action, ActionContext } from '../plugins';
import type { DataSchema } from '../plugins/DataAdapter';

declare module '../utils/types' {
  export interface AppTypeOverrides {
    App: Application;
    Data: DataSchema;
    Contexts: ActionContext;
    Actions: Action;
    ActionMap: Record<string, Action>;
    Scenes: string;
    Plugins: string;
  }
  export interface AssetTypeOverrides {
    Texture: string;
    TPSFrames: string;
    SpriteSheet: string;
    SpineData: string;
    Audio: string;
    FontFamily: string;
    BitmapFontFamily: string;
    Bundles: string;
  }
}

declare module '@caper-engine/core' {
  export interface AppTypeOverrides {
    App: Application;
    Data: DataSchema;
    Contexts: ActionContext;
    Actions: Action;
    ActionMap: Record<string, Action>;
    Scenes: string;
    Plugins: string;
  }
  export interface AssetTypeOverrides {
    Texture: string;
    TPSFrames: string;
    SpriteSheet: string;
    SpineData: string;
    Audio: string;
    FontFamily: string;
    BitmapFontFamily: string;
    Bundles: string;
  }
}
