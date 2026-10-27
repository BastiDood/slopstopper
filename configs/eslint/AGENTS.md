# ESLint Configurations

- Never hand-write rule lists. Change the Oxlint entries, then extend the Oxlint-to-ESLint conversion if the translation needs it.
- List-valued rules (`no-restricted-*`) belong in `restrictions`, not `rules`. ESLint replaces list options across configs, so `compose` concatenates them.
- The conversion prunes rules that ESLint 10 does not support, and a test fails when a generated rule is unknown to ESLint.
