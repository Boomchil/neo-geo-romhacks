import { defineConfig, type Plugin } from 'vite';
import { execFileSync } from 'node:child_process';

// Dev-only: patch/game descriptions are inlined into public/patches.index.json at build time, so a
// live edit needs the index regenerated. This watcher rebuilds it whenever a file under
// public/patches/ or public/pages/ changes, then reloads the page.
// (Production builds run `npm run build:index` before `vite build` - see package.json.)
function patchesIndexWatcher(): Plugin {
  const rebuild = () => {
    try {
      execFileSync('node', ['scripts/build-index.mjs'], { stdio: 'inherit' });
    } catch (e) {
      console.error('[build-index] failed:', e);
    }
  };
  // The generated index lives at public/patches.index.json (not under /patches/), so writing it
  // does not match this pattern - no rebuild loop.
  const watched = /[\\/](patches|pages)[\\/]/;
  return {
    name: 'patches-index-watcher',
    apply: 'serve',
    configureServer(server) {
      rebuild(); // fresh index when the dev server starts
      const onChange = (file: string) => {
        if (!watched.test(file)) return;
        rebuild();
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

export default defineConfig({
  // relative base => works on https://user.github.io/<repo>/ without knowing the repo name
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [patchesIndexWatcher()],
});
