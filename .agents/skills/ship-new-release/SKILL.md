---
name: ship-new-release
description: Use when preparing and shipping a Slop Stopper release, including package bumps, release notes, and a signed tag.
---

# Ship New Release

1. Find the previous release tag with `git describe --tags --abbrev=0` and review the diff since that tag. Choose a patch for compatible fixes, a minor for compatible features, or a major for breaking changes. For `0.x` versions, use a minor bump for breaking changes.
2. Apply the necessary bump to the release tag. Bump each affected package from its own version and update peer ranges as needed. Include dependents that need a new peer range. Keep `workspace:^` for internal peers so `pnpm` resolves each range at pack time, and check the packed manifests for the intended ranges.
3. Fill the [changelog template](./assets/changelog-template.md) from the same diff, replace `{{TAG}}` with the proposed tag, and save it as `.scratchpad/TAG.md`. Remove unused sections and template comments. Share the version diff, draft, and proposed tag for approval.
4. Once the bumps are committed and release approval is given, set `TAG` to the approved tag and run the commands below in order. Stop on failure. Add `--draft` to `gh release create` if requested, then share the release URL.

```bash
git tag --sign --cleanup=verbatim --file .scratchpad/TAG.md "$TAG"
git verify-tag "$TAG"
git push --tags
gh release create "$TAG" --title "$TAG" --verify-tag --notes-from-tag
```
