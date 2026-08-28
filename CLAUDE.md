# CLAUDE.md — Project Conventions

- Stack: Phaser 3 + TypeScript + Vite.
- Read DESIGN.md before building anything — it is the source of truth. When the designer states a new decision, add it to DESIGN.md.
- Placeholder art is colored shapes drawn in code. No image assets until the designer says the loop is fun.
- Small modules, one per system, with brief comments explaining what each system does.
- Git: commit after every working feature, with clear messages.
- Deployment: GitHub Actions builds and deploys to GitHub Pages on every push. If no GitHub remote is connected yet, walk the designer through connecting one.
- Performance target: smooth on a mid-range phone browser.
- Controls and UI: one-thumb friendly, touch and keyboard both, resolution-independent.
- End every turn by stating: how to run it locally, the live link (once deployed), and what to test.
- The designer gives feel-based feedback and is not a programmer. Explain choices simply; never assume technical background.
