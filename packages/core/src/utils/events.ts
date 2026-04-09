export enum CaperEvent {
  REQUIRED_ASSETS_START = 'caper-required-assets-start',
  REQUIRED_ASSETS_PROGRESS = 'caper-required-assets-progress',
  REQUIRED_ASSETS_COMPLETE = 'caper-required-assets-complete',
  ASSETS_START = 'caper-assets-start',
  ASSETS_PROGRESS = 'caper-assets-progress',
  ASSETS_COMPLETE = 'caper-assets-complete',
}

export type CaperProgressEvent = CustomEvent<{ progress: number }>;
