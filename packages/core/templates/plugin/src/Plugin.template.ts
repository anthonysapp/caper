import { IApplication, IPlugin, Logger, Plugin } from '@caperjs/core';

export type ~PluginName~PluginOptions = {
  // TODO: add plugin options here
  // e.g. apiKey: string;
};

export interface I~PluginName~Plugin extends IPlugin<~PluginName~PluginOptions> {}

const defaultOptions: ~PluginName~PluginOptions = {};

export class ~PluginName~Plugin
  extends Plugin<~PluginName~PluginOptions>
  implements I~PluginName~Plugin
{
  public readonly id = '~pluginName~';

  protected _options: ~PluginName~PluginOptions = defaultOptions;

  async initialize(options: Partial<~PluginName~PluginOptions> = {}, _app: IApplication): Promise<void> {
    this._options = { ...defaultOptions, ...options };
    Logger.log('~PluginName~ plugin initialized');
  }
}
