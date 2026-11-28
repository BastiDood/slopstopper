# `slopstopper/no-conditional-spread`

Reports a spread in an object literal, an array literal, or the arguments of a call or `new` that copies a literal allocated only to be spread:

- A conditional with `{}`, `[]`, `null`, or `undefined` on a branch, where either branch is an object or array literal, as in `{ ...(c ? { v } : {}) }`, `{ ...(c ? extra : {}) }`, `[...xs, ...(c ? [x] : [])]`, or `f(...(c ? [x] : []))`.
- A `??` fallback to an empty literal, as in `[...(maybe ?? [])]`. A `{}` fallback is left to another rule only when it is written bare at an object spread (see below).

Each of these builds a literal, copies its members into the receiver, and throws the literal away. Build the locally owned object, array, or argument array once. Then add the optional members in place in an `if` statement:

- For an object or array receiver, that saves the temporary allocation and states the omission directly.
- For call and `new` arguments, hoist the arguments into an array variable instead. The array still allocates once. The call then no longer hides the omission inside its argument list.
- When members follow the spread, build the result up to the spread, add the optional members in the `if`, and add the following members afterward. That order keeps their positions, which property wins, and the evaluation order.

These are left to other rules or not reported:

- An `&&` before a literal and an `||` fallback, as in `{ ...(c && { v }) }` or `[...(xs || [])]`, are left to [`no-non-boolean-logical`](../no-non-boolean-logical/README.md). It allows `&&` and `||` only between booleans.
- A fallback to `{}` written at an object spread, as in `{ ...(maybe ?? {}) }`, is left to `unicorn/no-useless-fallback-in-spread`. Its autofix spreads the value directly, as in `{ ...maybe }`.
- A spread of an existing value allocates nothing and is not reported, as in `{ ...(c ? extra : null) }`.
- A conditional that is not spread, as in `const o = c ? { v } : {}`, is not reported. It allocates only the value it picks.

A same-file `const` counts through its initializer when the spread is its one read. For example, `const extra = c ? { v } : {}; ({ ...extra })` is reported. The advice is to build the receiving object at the spread and drop `extra`. Building `extra` on its own would still copy it.

A placeholder branch or fallback that names a `const` of an empty literal is also reported, as in `const none = {}; ({ ...(c ? { v } : none) })`.

A read in a callback or a loop, as in `items.map(item => ({ ...item, ...extra }))`, is not followed. It copies one literal on every run. Moving the initializer there would evaluate it on every run. A placeholder or fallback `const` read there allocates its literal once. That literal is not temporary. A literal written in the other branch is still reported.

## Examples

Incorrect:

```ts
const update = { title, ...(typeof summary !== 'undefined' ? { summary } : {}) };
const result = { ...(settings.ablation ? { baseline: summarize(runs) } : {}) };
const tags = [...base, ...(typeof extraTag !== 'undefined' ? [extraTag] : [])];
const items = [...(run.items ?? [])];
const highest = Math.max(...(scores ?? []));
log(...(verbose ? [timestamp] : []), message);

const extra = verbose ? { trace: true } : {};
const request = { url, ...extra };
```

Correct:

```ts
const update: Update = { title };
if (typeof summary !== 'undefined') update.summary = summary;

const result: Result = {};
if (settings.ablation) result.baseline = summarize(runs);

const tags = [...base];
if (typeof extraTag !== 'undefined') tags.push(extraTag);

const items: Item[] = [];
if (typeof run.items !== 'undefined') items.push(...run.items);

const values: number[] = [];
if (typeof scores !== 'undefined') values.push(...scores);
const highest = Math.max(...values);

const args: string[] = [];
if (verbose) args.push(timestamp);
args.push(message);
log(...args);

const request: Request = { url };
if (verbose) request.trace = true;
```

Mutate only the result that this construction step owns. Copy borrowed input before inserting into it.

Keep a property absent when absence is its contract. Assigning `undefined` is a different state.

## Suggestion

When the literal alone initializes a `const` or `let` with a type annotation, a literal written at the spread gets the rewrite as a suggestion:

- The declaration keeps the members before the spread.
- An `if` after it inserts the members of the spread's value. Object properties become assignments. Array elements go into one `.push`.
- Array elements after the spread follow the `if` in a second `.push`.

```ts
// Before:
const update: Update = { title, ...(typeof summary !== 'undefined' ? { summary } : {}) };

// After:
const update: Update = { title };
if (typeof summary !== 'undefined') update.summary = summary;
```

These get no suggestion:

- An empty value literal, as in `c ? {} : {}`. The `if` would be empty.
- A value that is not a literal, as in `...(c ? extra : {})` or every `??` fallback. It would move into `Object.assign` or `.push(...value)`. That hides it from this rule. A large array also overflows the argument list.
- A spread among the moved members. The same reasons apply.
- Object members after the spread. A type that requires them would reject the base without them.
- A spread that is the literal's only member. `unicorn/no-useless-spread` already rewrites it.
- A declaration without a type annotation, or with a `readonly`, `Readonly<T>`, `ReadonlyArray<T>`, or `{ readonly [K in Keys]: V }` annotation. The inferred type lacks the inserted members. A read-only type forbids them.
- A TypeScript assertion around the spread operand, a moved branch, or a placeholder, as in `...((c ? { v } : {}) as T)`. The rewrite would drop it.
- A static `__proto__` key, as a moved member or as `__proto__: value` in the literal. An assignment would set or reach the prototype instead of defining a property.
- A moved property value that is an assignment or an index read such as `list[0]`. The assignment would chain assignments or ask for array destructuring.
- A rewrite that would drop a comment of the initializer, as in `{ a: /* note */ 1 }` among the moved members.
- A literal with a `get` or `set` accessor. An assignment would run the accessor instead of defining a property.
- A method among the moved members. An assignment would define a plain function property instead of a method.
- A spread into call arguments. The arguments have no declaration to build first.
- A placeholder that comes through a `const`. The rewrite would leave that `const` unread.
- With type information, a computed key that is not a literal, as in `[key]: value`. The check cannot tell whether the declared type lets an assignment write it.

Under an anonymous object type, a mapped type, or a `Record` with a broad key, the rewritten literal draws [`no-known-value-widening`](../no-known-value-widening/README.md). Annotate the declaration with a named interface instead.

With type information, each inserted key must be one that the declared type lets an assignment write. That is a property without a `readonly` modifier, or an index signature that is not read-only. That also refuses a key that the type lacks.

A spread skips the excess property check. So `const o: { a: number } = { a: 1, ...(c ? { b: 2 } : {}) }` type-checks. The suggested `o.b = 2` would not.

An array type needs the method that the suggestion calls:

- A read-only array type lacks it, even behind an alias such as `type Names = readonly string[]`.
- A union of array types, as in `number[] | string[]`, gets no array suggestion either. Unless the base narrows the union to one member, `.push` takes the intersection of the element types.

Without type information, as in Oxlint, these checks do not run. The suggested code can then fail to type-check. The type checker reports that.

The public type checker API also hides some types from the check:

- It does not show a `Readonly<T>` behind an alias or nested in another type, as in `Partial<Readonly<T>>`, a property from `as const`, or a getter without a setter. A key of those kinds counts as writable.
- It does not show a mapped type that removes `readonly`, such as `{ -readonly [K in keyof T]: T[K] }`, either. Its keys count as read-only and get no suggestion.

A key that only some members of a union declare, as in `A | B` where only `A` has `y`, also gets no suggestion. So does a key whose type differs between the members. The declaration narrows the variable to one member. The check reads the whole union.

A negated test can turn a `!==` run into a `===` run. So `k !== 1 && k !== 2 && open ? {} : { v }` gives `if (k === 1 || k === 2 || !open)`, which [`prefer-switch-lookup`](../prefer-switch-lookup/README.md) reports. Every form of that negation draws some report. Extract the run into a named function first.

The rewrite is a suggestion, not a fix:

- An assignment differs from a literal property for a computed key that evaluates to `__proto__`.
- A function or class that moves into an assignment also loses the `name` that a property would infer, as in `{ onClick: () => {} }`.

Apply the suggestion when neither holds. Otherwise, suppress the diagnostic.

## Limitations

- A conditional whose value branch is an `&&` or `||`, as in `{ ...(c ? ready && extra : {}) }`, is left to `no-non-boolean-logical`. Without type information, that rule reports the branch only when its right operand is visibly no boolean. So `ready && extra` draws no report in Oxlint.
- A `??` fallback to a non-empty value, as in `{ ...(overrides ?? defaults) }`, is a real default and is not reported.
- A conditional of two literals without a placeholder, as in `{ ...(c ? { a } : { b }) }`, is not reported. It copies a temporary literal too. Its rewrite needs an `if` with an `else` instead.
- A binding other than a same-file `const` is not followed. That covers an import, a `let`, and a parameter.
- An alias is not resolved: a `const` whose initializer is only another name, as in `const extra = inner;`, is not followed further. A placeholder or fallback inside a followed initializer can still name a `const`.
- A `const` that other code also reads is not followed. Other reads can guard the spread, as in `x === null ? null : { ...x }`, or fill the `const`, as in `const defaults: Options = {}; if (c) defaults.a = 1; ({ ...(overrides ?? defaults) })`. That code builds the result the way this rule recommends.
- An exported `const` is not followed, whether `export const`, `export { x }`, or `export default x` exports it. Neither is any `const` in a Svelte or Astro component, whose template can read it.
