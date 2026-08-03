import { describe, expect, it } from 'vitest';
import { injectPluginsIntoConfig } from './create.mjs';

describe('injectPluginsIntoConfig', () => {
  it('inserts plugins into an empty array', () => {
    const configContents = `export default {\n  plugins: [],\n};\n`;
    const pluginConfigs = [`['rollbar', { autoLoad: false }]`];

    const result = injectPluginsIntoConfig(configContents, pluginConfigs);

    expect(result).toContain(`plugins: [\n    ['rollbar', { autoLoad: false }]\n  ]`);
  });

  it('appends plugins alongside an existing non-empty array', () => {
    const configContents = `export default {\n  plugins: [['existing', { autoLoad: false }]],\n};\n`;
    const pluginConfigs = [`['rollbar', { autoLoad: false }]`];

    const result = injectPluginsIntoConfig(configContents, pluginConfigs);

    expect(result).toContain(`['existing', { autoLoad: false }]`);
    expect(result).toContain(`['rollbar', { autoLoad: false }]`);
    // both entries should end up inside a single well-formed array
    expect(result).toMatch(/plugins: \[[\s\S]*existing[\s\S]*rollbar[\s\S]*\]/);
  });

  it('appends plugins alongside an existing multiline array', () => {
    const configContents = `export default {\n  plugins: [\n    ['existing', { autoLoad: false }],\n  ],\n};\n`;
    const pluginConfigs = [`['rollbar', { autoLoad: false }]`, `['rive', { autoLoad: false }]`];

    const result = injectPluginsIntoConfig(configContents, pluginConfigs);

    expect(result).toContain(`['existing', { autoLoad: false }]`);
    expect(result).toContain(`['rollbar', { autoLoad: false }]`);
    expect(result).toContain(`['rive', { autoLoad: false }]`);
  });
});
