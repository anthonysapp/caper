import { definePlugin, IApplication, Plugin } from '@caper/core';

// Typed identity helper — same effect as writing `export const id = 'test'`
// etc. individually, but the object literal is checked against
// `PluginConfigInput` so typos and wrong types fail at compile time.
export const plugin = definePlugin({
  id: 'test',
  active: true,
});

export default class TestPlugin extends Plugin {
  public readonly id = plugin.id;

  public initialize(_options: unknown, app: IApplication): void {
    console.log('TestPlugin initialized', app);
  }
}
