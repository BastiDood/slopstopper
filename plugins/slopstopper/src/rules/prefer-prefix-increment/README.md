# `slopstopper/prefer-prefix-increment`

Reports `x += 1` and `x -= 1` in favor of `++x` and `--x`, and a postfix `x++` or `x--` whose value is discarded in favor of its prefix form, so that every step by one reads the same. A value is discarded in an expression statement, in the `init` or `update` of a `for` loop, in a sequence element other than the last, and in the last element of a discarded sequence.

## Examples

Incorrect:

```ts
let count = 0;
count += 1;
count--;
for (let i = 0; i < n; i++) {}
```

Correct:

```ts
let count = 0;
++count;
--count;
for (let i = 0; i < n; ++i) {}

// The old value is read.
const item = items[i++];
```

## Autofix

A discarded postfix update is always autofixed to its prefix form, because its value cannot change behavior.

`x += 1` has the value of `++x` only when `x` is a number: a string concatenates (`s += 1` appends `'1'`, while `++s` converts `s` to a number) and a bigint throws. The rule autofixes it when `x` is proven to be a number:

- with typescript-eslint type information, its type is `number`, a number literal type, or a union of those, and
- without it, `x` is a local `let` initialized to a number literal, such as `0` or `-1`, whose every other write is an update or a `+=` or `-=` of a number literal.

Otherwise, the rule offers a suggestion. Apply it when `x` is a number, and suppress the diagnostic otherwise. The rule reports without a rewrite when a comment outside the target would be dropped.

## Limitations

- Only an identifier or a member target of `+=` and `-=` with the number literal `1` is reported.
- A postfix update wrapped in a TypeScript expression such as `(x++) as number` counts as read.
