import { assetpackConfig } from '@caperjs/core/config/assetpack';

// Kitchen-sink art is authored at 1x, so opt out of caper's retina-first
// default resolutions (which treat sources as 2x and would render this art
// at half size).
export default assetpackConfig(undefined, {
  resolutions: { default: 1, low: 0.5 },
});
