# Provenance

Pi Constellation is a derivative of `packages/pi-pstack` from [casualjim/pi-mimir](https://github.com/casualjim/pi-mimir), itself derived from [Cursor pstack](https://github.com/cursor/plugins/tree/main/pstack).

- Imported pi-mimir commit: `c6ed4033d6ec7589b798a7efbe4458498c935b13`.
- Package subtree import commit: `e9191e4a0729cd7cf85f9abdd0af4e1c0596ebfa`.
- GitHub repository retains its fork relationship to casualjim/pi-mimir.
- The `constellation` branch contains only the standalone package extracted with `git subtree split`. Inherited monorepo branches were removed from this fork; upstream remains available at the linked source repository.
- The original MIT license and copyright notices are preserved in `LICENSE`.

Changes replace the Herdr delegation extension with a T3 Code adapter, migrate skill API/model-routing guidance, add the Constellation entrypoint, and add reproducible tests. This is not an official T3 Code, Pi, Cursor, or pi-mimir product.
