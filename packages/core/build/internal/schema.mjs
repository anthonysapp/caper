/**
 * Zod schema for `caper.config.ts`, strict by design: an unknown key is almost
 * always a typo or a stale option, and failing loudly beats silently ignoring it.
 */
import { z } from 'zod';

export const pluginConfigSchema = z.union([
  z.string(),
  z.tuple([
    z.string(),
    z
      .object({
        autoLoad: z.boolean().optional(),
        options: z.any().optional(),
      })
      .loose(),
  ]),
]);

export const caperConfigSchema = z
  .object({
    id: z.string().min(1).optional(),
    application: z.any().optional(),
    defaultScene: z.string().min(1).optional(),
    defaultSceneLoadMethod: z.string().optional(),
    plugins: z.array(pluginConfigSchema).optional(),
    scenes: z.any().optional(),
    assets: z
      .object({
        manifest: z.any().optional(),
        preload: z
          .object({
            bundles: z.array(z.string()).optional(),
          })
          .loose()
          .optional(),
        background: z
          .object({
            bundles: z.array(z.string()).optional(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
    useStore: z.boolean().optional(),
    useSpine: z.boolean().optional(),
    useLayout: z.boolean().optional(),
    useVoiceover: z.boolean().optional(),
    useHash: z.boolean().optional(),
    // Build-time only — read by readCaperBuildFlags(), no runtime effect.
    useWasm: z.boolean().optional(),
    showStats: z.boolean().optional(),
    showSceneDebugMenu: z.boolean().optional(),
    resizeToContainer: z.boolean().optional(),
    logger: z.string().optional(),
    sceneGroupOrder: z.array(z.string()).optional(),
  })
  .loose();

/**
 * Evaluate the user's `caper.config.ts` through Vite's own module
 * graph and validate the default export. Dev-only — requires a live
 * `server` (i.e. `vite dev`). Returns `true` on success.
 */
