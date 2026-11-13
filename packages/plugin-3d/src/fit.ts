/**
 * The vertical field of view (degrees) that keeps everything a `fitAspect` screen would show in frame.
 * Screens at least as wide as `fitAspect` keep `fov`; narrower ones (portrait) get a taller field of view,
 * so the sides are not cropped. Without `fitAspect` the answer is always `fov`.
 */
export function fitFov(fov: number, aspect: number, fitAspect?: number): number {
  if (!fitAspect || !(aspect > 0) || aspect >= fitAspect) return fov;
  const halfTan = Math.tan((fov * Math.PI) / 360);
  return (2 * Math.atan((halfTan * fitAspect) / aspect) * 180) / Math.PI;
}
