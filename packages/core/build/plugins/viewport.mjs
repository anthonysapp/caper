/**
 * Makes `env(safe-area-inset-*)` report real values.
 *
 * Without `viewport-fit=cover` the browser insets the layout viewport itself, so
 * every safe-area inset reads 0 and an installed PWA (standalone/fullscreen) has
 * no way to know the status bar / gesture bar is sitting on top of the canvas.
 * The meta tag is the app's, not caper's, so this amends whatever is already
 * there rather than replacing it.
 */
const VIEWPORT_META = /<meta\b[^>]*\bname=["']viewport["'][^>]*>/i;
const CONTENT_ATTR = /\bcontent=(["'])([\s\S]*?)\1/i;

export function withViewportFitCover(html) {
  const meta = html.match(VIEWPORT_META);

  if (!meta) {
    return {
      html,
      tags: [
        {
          tag: 'meta',
          attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' },
          injectTo: 'head',
        },
      ],
    };
  }

  const tag = meta[0];
  const content = tag.match(CONTENT_ATTR);
  if (!content || content[2].includes('viewport-fit')) {
    return html;
  }

  const patched = tag.replace(
    CONTENT_ATTR,
    (_match, quote, value) => `content=${quote}${value}, viewport-fit=cover${quote}`,
  );
  return html.replace(tag, () => patched);
}

export function createCaperViewportPlugin() {
  return {
    name: 'vite-plugin-caper-viewport',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return withViewportFitCover(html);
      },
    },
  };
}
