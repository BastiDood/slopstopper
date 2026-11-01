# `slopstopper/prefer-while-true`

Reports a `for (;;)` loop, which has no init, test, or update, in favor of `while (true)`, which states the infinite loop in words.

## Examples

Incorrect:

```ts
for (;;) {
	if (done()) break;
}
```

Correct:

```ts
while (true) {
	if (done()) break;
}
```

`no-constant-condition` with `{ checkLoops: 'allExceptWhileTrue' }` accepts `while (true)`.

## Autofix

The fix rewrites the loop head from `for` to its closing parenthesis to `while (true)`, and keeps the body and any label. The two loops behave the same. The rule reports without fixing when a comment inside the head would be dropped.

## Limitations

- A `for` loop with only an init, such as `for (let i = 0; ; )`, is not reported.
