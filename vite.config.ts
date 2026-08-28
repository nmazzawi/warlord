import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Actions workflow to "/<repo-name>/" so the
// built game works when served from https://<user>.github.io/<repo-name>/.
// Locally it stays "/" so `npm run dev` just works.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
