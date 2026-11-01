# `slopstopper/no-plain-template-literal`

Reports an untagged template literal without expressions in favor of a quoted string, so that a backtick signals interpolation. A template whose raw text spans several lines reads better as a template, so it is not reported. Nor is a template whose value spells a placeholder, as in `` `\${a}` ``, because `no-template-curly-in-string` reports that value as a string.

## Examples

Incorrect:

```ts
const a = `name`;
const b = `a\tb`;
type C = `c`;
```

Correct:

```ts
const a = 'name';
const b = 'a\tb';
type C = 'c';

const d = `${a}!`;
const e = String.raw`C:\path`;
const f = `first line
second line`;
```

## Autofix

The fix replaces the template with a single-quoted string of the same value. When the raw text holds no `'`, no escaped backtick and no escaped `$` or `{`, the string keeps the raw text, so escapes such as `\n` keep their spelling. Otherwise the string escapes `\`, `'`, every control character, `\u2028` and `\u2029` in the value.

A template holds no comments, so the fix drops none. The rule reports without fixing a template that forms a whole statement, because a string statement in a directive prologue is a directive, as in `'use strict'`.

## Limitations

- A type-level template with a type, as in `` `a${string}` ``, is a `TSTemplateLiteralType` and is not reported.
- The fix always uses single quotes; the formatter picks the final quotes.
