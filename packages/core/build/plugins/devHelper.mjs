/**
 * Bridges a runtime error from the app back to vite's dev overlay.
 *
 * The app sends `caper:show-error` over vite's websocket; this echoes it back as
 * vite's own `error` event so the overlay renders it like a build failure.
 */
export function caperDevHelperPlugin() {
  return {
    name: 'vite-plugin-caper-dev-helper',
    configureServer(server) {
      server.ws.on('caper:show-error', (data) => {
        const { error } = data;
        // Send the 'error' event back to the client
        server.ws.send({
          type: 'error',
          err: {
            message: error.message || 'An unknown error occurred.',
            stack: error.stack || new Error(error.message).stack,
            id: error.id,
            loc: {
              file: error.id,
              line: error.line,
              column: error.column,
            },
            plugin: 'caper-dev-helper',
          },
        });
      });
    },
  };
}
