import { FlexContainer } from '@caperjs/core';
import { Container, Graphics, Sprite, Text } from 'pixi.js';

/**
 * The intrinsic elements JSX can name. Every entry is a zero-arg-constructible
 * Pixi display object; the renderer applies props to the instance afterwards.
 */
export const catalog = {
  container: Container,
  sprite: Sprite,
  text: Text,
  graphics: Graphics,
  // Caper UI primitive. Its layout props (`gap`, `flexDirection`, …) are plain
  // accessors that re-run its deferred layout pass, so `setProperty`'s default
  // assignment is all it needs.
  flexContainer: FlexContainer,
} as const;

export type CatalogTag = keyof typeof catalog;

/** Construct the display object for an intrinsic tag. Throws on unknown tags. */
export function createCatalogNode(tag: string): Container {
  const Ctor = catalog[tag as CatalogTag] as unknown as (new () => Container) | undefined;
  if (!Ctor) {
    throw new Error(`[@caperjs/solid] Unknown element <${tag}>. Known elements: ${Object.keys(catalog).join(', ')}.`);
  }
  return new Ctor();
}
