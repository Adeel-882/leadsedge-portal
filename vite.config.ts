import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig({
  // Vinext beta imports its App Router navigation module both statically and
  // dynamically from next/link. Rolldown otherwise folds that module into the
  // browser entry and drops the namespace exports used by the dynamic import,
  // producing `... is not a function` errors in production navigation.
  // Preserve that module boundary until the upstream bundling issue is fixed.
  build: {
    rolldownOptions: {
      output: {
        minifyInternalExports: false,
        codeSplitting: {
          groups: [{
            name: 'vinext-navigation',
            test: /vinext[\\/]dist[\\/]shims[\\/]navigation\.js$/,
            priority: 100,
            minSize: 0,
            minModuleSize: 0,
          }],
        },
      },
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  plugins: [vinext()],
});
