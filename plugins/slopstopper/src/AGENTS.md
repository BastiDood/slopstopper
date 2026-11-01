# Rule Implementation

## Validation

- Validate and normalize a value once at the entry point, then pass the narrowed type forward. Callees state their assumptions in JSDoc and parameter types instead of re-checking them.

## Fixes and Suggestions

- Make a rewrite an autofix only when the rule proves that it preserves behavior.
- Offer a rewrite that can change behavior in rare cases as a suggestion. Its message tells the author to suppress the diagnostic when the rewrite would break the code.
- Report without a rewrite only when no rewrite exists or the rewrite would be wrong.
