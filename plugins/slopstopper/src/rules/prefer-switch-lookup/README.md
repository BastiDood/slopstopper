# `slopstopper/prefer-switch-lookup`

Reports a constant lookup that reads better, and usually runs faster, as a `switch` in its own function: an `||` chain of `===` comparisons against one value, or an array, `Set`, `Map`, or object literal whose keys a `switch` case can name. The rule sorts each table by what the code does with it (it tests membership, looks up a value, or dispatches to a handler), and each of these operations has a limit on the number of entries. Above the limit, a membership test against an array or a chain becomes a `Set` instead. An array that holds other values, and that is only searched with `.includes`, becomes a `Set` too.

## Examples

Incorrect:

```ts
const vowel = c === 'a' || c === 'e' || c === 'i';

const IMAGE_TYPES = ['png', 'jpeg', 'gif'] as const;
const isImage = (extension: string) => IMAGE_TYPES.includes(extension);

const CLASSES = ['regression', 'flaky', 'inconclusive'] as const;
type TaskClass = (typeof CLASSES)[number];
const severity = (c: TaskClass) => CLASSES.indexOf(c);

const MIME_TYPES = new Map([
	['png', 'image/png'],
	['txt', 'text/plain'],
]);
const mimeType = MIME_TYPES.get(extension);

const HANDLERS = { create, update, remove };
HANDLERS[action](payload);

const IDS = rows.map(row => row.id);
const isKnown = (id: string) => IDS.includes(id);
```

Correct:

```ts
function isVowel(c: string) {
	switch (c) {
		case 'a':
		case 'e':
		case 'i':
			return true;
		default:
			return false;
	}
}

type TaskClass = 'regression' | 'flaky' | 'inconclusive';

function severity(c: TaskClass) {
	switch (c) {
		case 'regression':
			return 0;
		case 'flaky':
			return 1;
		case 'inconclusive':
			return 2;
	}
}

function dispatch(action: Action, payload: Payload) {
	switch (action) {
		case 'create':
			return create(payload);
		case 'update':
			return update(payload);
		case 'remove':
			return remove(payload);
	}
}

const IDS = new Set(rows.map(row => row.id));
const isKnown = (id: string) => IDS.has(id);
```

## Options

```ts
{ 'slopstopper/prefer-switch-lookup': ['error', { membership: 16, values: 16, dispatch: 24 }] }
```

Each option is the largest number of entries that the rule turns into a `switch`, and each is an integer of at least `1`. The defaults come from the benchmark below.

| Option       | Operation                                | Reads                                                                                                                             |
| ------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `membership` | Tests whether a value is one of the keys | `\|\|` chains, `A.includes(k)`, `A.indexOf(k)` compared with `-1` or `0`, `S.has(k)`, `M.has(k)`, `k in O`, `Object.hasOwn(O, k)` |
| `values`     | Looks up the value of a key              | `O[k]`, `M.get(k)`, `A.indexOf(k)` read as a position                                                                             |
| `dispatch`   | Calls the function found for a key       | `O[k](…)`, `O[k]?.(…)`, `M.get(k)?.(…)`, or `const h = O[k]` whose every read is a call                                           |

## Tables

A table is one of these literals, written where it is used or bound to a `const`:

- An array literal whose every element is a [case comparand](#case-comparands), with or without `as const`.
- `new Set([...])` of case comparands, or `new Map([[key, value], ...])` whose every key is a case comparand. A local class that shadows `Set` or `Map` does not count.
- An object literal with static keys and no spreads, accessors, or `__proto__` key.

A value of a `Map` or object must fit a `case` that returns it: a literal other than a regular expression, a template literal without expressions, a negated number, an identifier, a static member of an identifier, or a function. An object or array literal, a call, or `new` builds a new value on every evaluation, which a `case` would do on every call, so a table that holds one is not reported.

A bound table must be a `const` that is not exported, and every read of it must be a lookup from the options table, `.length` or `.size`, or a `typeof` type query, as in `(typeof CLASSES)[number]`. Any other read, such as iteration, a static member read like `K.A`, a write, or passing the table on, leaves it alone, because a `switch` cannot replace it.

A table whose values are all functions dispatches once one of its found values is called, and its `in` and `has` tests then count as guards of the call. A table that is called but holds other values too is not reported. Otherwise, any value read makes it a value table, and a table with only membership tests is a membership table.

## Above the Limit

- An `||` chain longer than the `membership` limit is reported as a `Set` of the values with one `.has` call.
- A bound array above the `membership` limit is reported as a `Set`. When every read is an `.includes` call and the binding has no type annotation, the autofix wraps the initializer in `new Set(…)` and renames each `.includes` to `.has`. Both compare with SameValueZero, so the fix preserves behavior.
- An inline array above the limit is reported, and the message asks to hoist it into a module-level `Set`.
- A `Set`, `Map`, or object above its limit is left alone.

## Arrays of Other Values

An array that is no table, such as `[a, b]` or `rows.map(row => row.id)`, is reported as a `Set` when every read is `A.includes(x)` and the search runs more than once: there are several reads, or the one read sits in a function or a loop. The initializer must build an array: an array literal, `new Array`, `Array`, `Array.from`, `Array.of`, or a call of a method that returns a new array, such as `map`, `filter`, or `slice`.

The rewrite is the same as above. It is an autofix when the initializer is proven to be an array, as for a literal or a method call on a known array. It is a suggestion when only the method name says so, because a string has `concat` and `slice` too, and a string's `.includes` searches for a substring.

## Case Comparands

A key counts when a `switch` case can name it:

- A string, number, boolean, or bigint literal, a template literal without expressions, or a negated number.
- An identifier bound to a same-file `const` whose initializer is such a literal, also through `as const` or `satisfies`.
- A member `E.A` of a same-file `enum E`.
- A member `K.A` of a same-file `const K` object literal, optionally `as const`, whose property `A` is such a literal.

Comparisons against `null`, `undefined`, or other references guard or narrow a value instead of naming a case, so `x === null || x === y` is not reported. Neither is `x === A || y === A`, which compares two values against one constant.

## Type Information

With typescript-eslint type information, a comparand also counts when its type is a single literal type: a string, number, or bigint literal, `true`, `false`, or an enum member. This covers imported and declared constants, as in `declare const A: 'a'`. Unions such as `boolean` or a whole enum, `any`, `unknown`, and `never` do not count.

## Negated Chains

The rule does not report `c !== 'a' && c !== 'e'`. [`prefer-de-morgan`](../prefer-de-morgan/README.md) first rewrites it to `!(c === 'a' || c === 'e')`, and this rule then reports the positive chain inside, which becomes `!isVowel(c)`.

## Benchmark

The limits come from a benchmark of each table form against a `switch` on two JavaScript engines. It ran in November 2026 on one laptop with an AMD Ryzen 7 7435HS and Windows 11, with V8 in Node 26.12.1 and JSC in Bun 1.4.5.

### Method

- **Configurations.** Every combination of operation, table form, key count (1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, and 64), and input scenario is one configuration. Each configuration has its own generated lookup function and its own generated loop, so that every call site sees one function and the engine can inline it.
- **Inputs.** 75% of the inputs hit a key, spread evenly over the keys, and 25% miss. Every configuration builds its own input strings, because table lookups change a runtime string in V8 on first use, so shared inputs would hand one strategy strings that another had already converted.
- **Routing handlers.** Each key's handler computes `(x * c) ^ i` with its own constants, so that choosing the handler is most of the cost. The calling `switch` and the tables call the same declared functions, which isolates the dispatch. The loop keeps its sum a 32-bit integer, so the optimized code never falls back to floating point.
- **Isolation.** V8 ran under Node's built-in `node:bench` (`--experimental-bench`), one fresh child process per run. JSC ran under Bun with the same warm-up, sample count, batching, and order. Each process ran the configurations in its own shuffled order, so slow drift spreads over all of them.
- **Compiler tiers.** Each V8 loop was forced to TurboFan before measuring, and every loop was still in TurboFan after its last sample. Every JSC loop was compiled by its optimizing DFG tier.
- **Samples.** Each configuration took 10 warm-up and 10 measured samples in each of 6 processes; the interned and integer scenarios took 25 measured samples per process. A sample repeats the loop over 4,096 inputs for at least 2 ms, except in the new-string scenarios below. On the interned and integer data, 6 processes × 10 samples gave intervals within a few percent of 6 × 25. Fewer processes widened them more than fewer samples did.
- **Statistics.** A configuration's time is the median of its samples in nanoseconds per lookup, including the loop that reads the next input. Its 95% interval comes from a hierarchical bootstrap with 2,000 resamples, which draws whole processes first and then samples within each. The ratio of a `switch` to a table pairs the two by process. The `switch` is slower at a key count when the whole interval of the ratio lies above 1.

```ts
// One sample of one configuration, outside the timer: fresh inputs and a minor collection where the scenario needs them.
if (config.fresh) {
	config.inputs = config.sources.map(runtimeCopy);
	gc({ type: 'minor' });
}
const start = process.hrtime.bigint();
for (let r = 0; r < config.repetitions; ++r) {
	for (const input of config.inputs) accumulator = (accumulator + config.lookup(input)) | 0;
}
const nanosecondsPerLookup =
	Number(process.hrtime.bigint() - start) / (config.repetitions * config.inputs.length);
```

### Input Scenarios

| Scenario                             | Keys                                                                                           | Lookups                                                                                                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interned                             | Random lowercase words of 3 to 12 letters                                                      | The interned copies that literals use. Literals, `Object.keys` results, and short `JSON.parse` strings such as `"png"` are interned in V8.                                                                                                      |
| New string each lookup               | Random words                                                                                   | A string built at runtime that no lookup has seen, such as `path.extname(file).slice(1)`, a template literal, or `.toLowerCase()`. Each sample builds 65,536 new strings and a minor collection outside the timer, then looks each one up once. |
| New shared-prefix string each lookup | `item_000`, `item_001`, and so on, all the same length, like `user.created` and `user.deleted` | As above                                                                                                                                                                                                                                        |
| Same runtime string reused           | Random words                                                                                   | One runtime-built string is looked up again and again. The table lookups convert it on first use, which makes their later lookups cheaper, while `switch`, `===`, and `includes` leave it as it is.                                             |
| Same shared-prefix string reused     | Shared-prefix keys                                                                             | As above                                                                                                                                                                                                                                        |
| Small integers                       | The numbers 0 to n − 1                                                                         | The numbers themselves                                                                                                                                                                                                                          |

### Results

Each cell is the largest key count at which a `switch` is not slower than the named table, with every smaller count also not slower. 64+ means it was not slower anywhere from 1 to 64 keys, and 0 means it was slower even with one key.

V8 (Node 26.12.1):

| Input                                | `Set.has` | `Map.get` | `obj[k]` | `Object.hasOwn` | `includes` | `indexOf` | Dispatch vs. object | Dispatch vs. `Map` |
| ------------------------------------ | --------- | --------- | -------- | --------------- | ---------- | --------- | ------------------- | ------------------ |
| Interned                             | 24        | 24        | 64+      | 64+             | 64+        | 64+       | 64+                 | 64+                |
| New string each lookup               | 64+       | 64+       | 64+      | 64+             | 64+        | 6         | 64+                 | 64+                |
| New shared-prefix string each lookup | 16        | 16        | 16       | 16              | 6          | 2         | 24                  | 32                 |
| Same runtime string reused           | 2         | 6         | 6        | 8               | 64+        | 64+       | 24                  | 24                 |
| Same shared-prefix string reused     | 1         | 1         | 3        | 4               | 32         | 3         | 8                   | 6                  |
| Small integers                       | 64+       | 4         | 4        | 64+             | 64+        | 64+       | 64+                 | 64+                |

JSC (Bun 1.4.5):

| Input                                | `Set.has` | `Map.get` | `obj[k]` | `Object.hasOwn` | `includes` | `indexOf` | Dispatch vs. object | Dispatch vs. `Map` |
| ------------------------------------ | --------- | --------- | -------- | --------------- | ---------- | --------- | ------------------- | ------------------ |
| Interned                             | 64+       | 64+       | 64+      | 24              | 64+        | 64+       | 64+                 | 64+                |
| New string each lookup               | 64+       | 64+       | 64+      | 64+             | 64+        | 64+       | 64+                 | 64+                |
| New shared-prefix string each lookup | 64+       | 64+       | 64+      | 64+             | 64+        | 64+       | 64+                 | 64+                |
| Same runtime string reused           | 64+       | 64+       | 8        | 0               | 64+        | 1         | 64+                 | 64+                |
| Same shared-prefix string reused     | 48        | 48        | 6        | 1               | 64+        | 64+       | 1                   | 64+                |
| Small integers                       | 6         | 6         | 6        | 64+             | 64+        | 64+       | 64+                 | 6                  |

At 16 keys on V8, a `switch` takes this fraction of the time of `Set.has`, with its 95% interval:

| Input                                | `switch` ÷ `Set.has` | `switch` ÷ `Map.get` |
| ------------------------------------ | -------------------- | -------------------- |
| New string each lookup               | 0.44 (0.39–0.56)     | 0.45 (0.38–0.57)     |
| Interned                             | 0.64 (0.62–0.68)     | 0.65 (0.59–0.79)     |
| New shared-prefix string each lookup | 0.75 (0.62–0.84)     | 0.87 (0.64–1.09)     |
| Same runtime string reused           | 4.47 (2.75–5.44)     | 3.04 (2.26–3.56)     |
| Small integers                       | —                    | 1.08 (0.84–1.23)     |

A new runtime string is the case that favors a `switch` most. On V8, `Set.has`, `Map.get`, and `obj[k]` take 55 to 80 ns on a string that no lookup has seen, while a `switch` over 2 keys takes about 13 ns. V8 compares the cases of a string `switch` one after another, so its cost grows with the key count and with a shared prefix: with 64 new shared-prefix strings, a `switch` takes about 210 ns.

### Defaults

The defaults are the largest key counts at which a `switch` is faster than or about even with a `Set` or `Map` on V8 for interned strings, new strings, and small-integer membership, and on JSC for every string input:

- `membership: 16` and `values: 16` hold for interned strings, for new strings, and for new shared-prefix strings, which turn slower at 24 keys.
- `dispatch: 24` holds for every scenario except the reused shared-prefix string, which turns slower at 8 to 12 keys.

The defaults cost speed in two cases. Code that looks up the same runtime-built string again and again runs 3 to 4.5 times slower at 16 keys on V8, and slower from 2 keys for a membership test. Value lookups with small integer keys run about 1.1 times slower from 6 keys on V8. A project whose lookups mostly reuse runtime strings, or whose keys share long prefixes, can lower the limits; `{ membership: 2, values: 6, dispatch: 8 }` is not slower on V8 for any of the mixed-string scenarios.

### Limits of the Benchmark

- One machine with no CPU pinning or frequency lock. Many configurations varied by more than 15% between processes, which the bootstrap intervals include. Differences of 2 times or more hold in every process, while differences near 1.1 times do not.
- Nothing was measured past 64 keys.
- With new shared-prefix strings, V8's `includes` overtakes a `switch` past 6 keys, by up to 1.5 times at 64 keys. Both compare the keys one after another, so the two stay close.
- The handlers of the routing benchmark do almost no work. Real handlers that do more shrink every dispatch difference.

## Limitations

- Without type information, imported constants never count as case comparands. A `let` variable counts only through the type tier, when its type is a single literal type.
- Only the `Set` rewrite has a fix. A `switch` needs a function name and a place, which the rule cannot choose.
- Only `===` counts in a chain. `==` comparisons and `&&` chains are not reported.
- The compared value of a chain must be an identifier, `this`, `super.name`, or a member chain with static keys, as in [`prefer-switch`](../prefer-switch/README.md). Calls and dynamic keys such as `a[k]` are not compared.
- Only contiguous runs count in a chain. An operand that does not fit ends the run, and the next comparison can start a new one, so one chain can hold several runs on different values. Each run is reported once, and nested `||` chains count as one chain.
- The test of an `if` in a decision that [`prefer-switch`](../prefer-switch/README.md) owns is left to that rule, also when `prefer-switch` skips the decision because of an unlabeled `break`.
- `k in O` and `O[k]` also find inherited keys such as `toString`, which a `switch` does not. Check that the looked-up keys cannot name an inherited property before rewriting.
- A bound `let`, an exported table, and a table that is read in another file are not reported.
