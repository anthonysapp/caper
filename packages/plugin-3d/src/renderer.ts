type Renderer3D = {
  name?: string;
  gl?: { texImage3D?: unknown };
  context?: { gl?: { texImage3D?: unknown } };
  lighting3d?: unknown;
};

export function assertRenderer3D(value: unknown): void {
  const renderer = value as Renderer3D | null | undefined;
  if (!renderer)
    throw new Error('[@caperjs/plugin-3d] No renderer is available. Create the renderer before a 3D view.');
  if (renderer.name === 'canvas')
    throw new Error('[@caperjs/plugin-3d] Canvas renderer cannot draw 3D. Use WebGL2 or WebGPU.');
  if (renderer.name === 'webgl' && typeof (renderer.gl ?? renderer.context?.gl)?.texImage3D !== 'function') {
    throw new Error('[@caperjs/plugin-3d] WebGL2 is required; this renderer is using WebGL1.');
  }
  if (!renderer.lighting3d) {
    throw new Error(
      "[@caperjs/plugin-3d] @pixi/3d was loaded after the renderer was created. Add '3d' to plugins in caper.config.ts and do not mark it autoLoad: false.",
    );
  }
}
