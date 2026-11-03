# `slopstopper/no-conditional-empty-object-spread`

Reports a spread in an object literal of a conditional whose consequent or alternate is an empty object literal, as in `{ ...(c ? { v } : {}) }`. The empty object hides the omission of properties behind an expression. An `if` statement that adds the properties states the omission directly.

## Examples

Incorrect:

```ts
const options = { name, ...(timeout !== undefined ? { timeout } : {}) };
const user = { id, ...(anonymous ? {} : { email }) };
```

Correct:

```ts
const options: Options = { name };
if (typeof timeout !== 'undefined') options.timeout = timeout;

const user: User = { id };
if (!anonymous) user.email = email;
```

## No Autofix

The rule reports without a rewrite. The object must move into its own declaration so that an `if` statement can add the properties, which restructures the surrounding statements and often needs a type annotation on the declaration.

## Limitations

- A conditional inside TypeScript assertions, as in `...((c ? { v } : {}) as Partial<T>)`, is not reported.
- An empty object behind a TypeScript assertion, as in `c ? { v } : ({} as T)`, is not reported.
- Other omission patterns, such as `...(c && { v })`, are not reported.
