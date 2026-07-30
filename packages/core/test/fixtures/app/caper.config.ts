import { App } from '@/App';
import { defineActions, defineButtons, defineConfig, defineContexts, defineControls, defineData } from '@caperjs/core';

export const contexts = defineContexts();
export const actions = defineActions(contexts, {});
const buttons = defineButtons();
export const controls = defineControls(actions, buttons);
export const initialData = defineData({});

export default defineConfig({
  id: 'caper-build-fixture',
  application: App,
  defaultSceneLoadMethod: 'immediate',
  defaultScene: 'main',
  data: {
    initial: initialData,
    backupKeys: [],
    backupAll: false,
  },
  actions,
  input: { controls },
  plugins: [],
});
