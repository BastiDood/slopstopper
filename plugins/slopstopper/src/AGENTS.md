# Rule Implementation

## Progressive Enhancement

Oxlint doesn't yet provide type-aware properties in its public ESLint-compatible API yet. Therefore, rules must be implemented in such a way that progressively enhances linting behavior as type information becomes available (i.e., in ESLint environments).

## Validation

Validate and normalize a value once at the entry point, then pass the narrowed type forward. Callees state their assumptions in JSDoc and parameter types instead of re-checking them.

## Fixes and Suggestions

- Make a rewrite an autofix only when the rule proves that it preserves behavior.
- Offer a rewrite that can change behavior in rare cases as a suggestion. Its message tells the author to suppress the diagnostic when the rewrite would break the code.
- Report without a rewrite only when no rewrite exists or the rewrite would be wrong.
