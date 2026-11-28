# `slopstopper/prefer-switch-lookup`

Reports a constant lookup that reads better as a `switch` in its own function, which usually also runs faster. The lookup is one of these:

- An `||` chain of `===` comparisons against one value.
- An array, `Set`, `Map`, or object literal whose keys a `switch` case can name.

The rule sorts each table by what the code does with it: test membership, look up a value, or dispatch to a handler. Each of these operations has a limit on the number of entries.

- Above the limit, a membership test against an array or a chain becomes a `Set` instead.
- An array that holds other values, and that is only searched with `.includes`, becomes a `Set` too.

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

| Option       | Operation                                | Reads                                                                                                                                                                           |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `membership` | Tests whether a value is one of the keys | `\|\|` chains, `A.includes(k)`, `A.indexOf(k)` compared for equality with `-1` or by `> -1`, `<= -1`, `>= 0`, or `< 0`, `S.has(k)`, `M.has(k)`, `k in O`, `Object.hasOwn(O, k)` |
| `values`     | Looks up the value of a key              | `O[k]`, `M.get(k)`, or `A.indexOf(k)` read as a position, including a test of the value, as in `if (O[k])`                                                                      |
| `dispatch`   | Calls the function found for a key       | `O[k](…)`, `O[k]?.(…)`, `M.get(k)?.(…)`, or `const h = O[k]` that is called and otherwise only tested                                                                           |

## Tables

A table is one of these literals with at least one entry, written where it is used or bound to a `const`:

- An array literal whose every element is a [case comparand](#case-comparands), with or without `as const`.
- `new Set([...])` of case comparands, or `new Map([[key, value], ...])` whose every key is a case comparand. The array argument and each `[key, value]` pair can carry `as const` or `satisfies`. A local class that shadows `Set` or `Map` does not count.
- An object literal with static keys and no spreads, accessors, or `__proto__` key. A computed key counts when it is a string or number literal, as in `{ ['a']: 1 }`, since it names the same key as a plain one. Any other computed key, such as `[E.A]`, rules the table out.

### Values

A value of a `Map` or object must fit a `case` that returns it:

- **Fits:** a literal other than a regular expression, a template literal without expressions, a negated number, an identifier, a static member of an identifier, or a function.
- **Does not fit:** an object or array literal, a call, or `new`. Each builds a new value on every evaluation, which a `case` would do on every call. A table that holds one is not reported.

### Reads

A bound table must be a `const`. Each read of it decides whether a `switch` can replace it:

- **Lookups:** the reads in the [options table](#options). A key read through a name, as in `K[A]` or `K[E.A]`, is a lookup, even when the name holds a constant.
- **Size and type reads:** `.length`, `.size`, and a `typeof` type query, as in `(typeof CLASSES)[number]`. These do not stop the report.
- **Other reads:** iteration, a write, passing the table on, or a static member read such as `K.A`, `K['A']`, `K[-1]`, or `K[true]`. Any of these leaves the table alone, because a `switch` cannot replace it.

### Operations

The reads decide which operation a table performs:

- **Dispatch:** one of the found values is called, and every value can be a function. A function expression, a name, or a static member can hold a function. This covers a declared function, an imported or undeclared name, an alias, and a wrapper call such as `const g = memoize(f)`.
- **No dispatch:** a literal holds no function, and neither does a `const` whose initializer is a literal, a template, an operator, or an object or array literal. A table that holds such a value and is called is not reported. Neither is a table whose found value is called and also read some other way.
- **Guards:** an `in` or `has` test guards a dispatch call. So does a found value that is only tested: the test of an `if`, a loop, or a conditional, the operand of `!`, the left side of `&&`, a comparison with `null` or `undefined`, or a `typeof` compared with a string. For example, `H[k] && H[k]()` and `const h = H[k]; if (!h) throw …; h()` both dispatch.
- **Values:** any other value read or test makes the table a value table.
- **Membership:** a table with only membership tests is a membership table.

## Exported Tables

A table counts as exported when `export const` declares it, or when `export { T }` or `export default T` names it.

Other modules can read an exported table in any way, such as iterating it, so the rule never asks to remove one. Instead, it reports each lookup of the table in its own file that a local `switch` replaces. The export stays for the other modules.

- **Operation and limit:** these come from the lookups in the file. Reads that are no lookup are skipped.
- **Writes:** a write in the file shows that the table is no constant, so none of its lookups is reported. Examples are `T[k] = v`, `delete T.a`, `A.push(x)`, `S.add(x)`, and `M.set(k, v)`.
- **Reported reads:** only the reads that the `switch` replaces. For a dispatch table, these are the calls, not the `in` or `has` tests that guard them. For a value table, these are the value reads, not the membership tests beside them.
- **Found values:** a found value that is bound to an exported `const` counts as a value read, since other modules can read it without calling it.
- **No `Set` advice:** an exported table above its limit, and an exported array that is no case table, are left alone. Other modules can depend on the array itself.

```ts
export const CLASSES = ['low', 'medium', 'high'] as const;
export type Class = (typeof CLASSES)[number];

// Reported: a local `switch` that returns each rank replaces this lookup.
const rank = (c: Class) => CLASSES.indexOf(c);
```

## Above the Limit

- An `||` chain longer than the `membership` limit is reported as a `Set` of the values with one `.has` call.
- A bound array above the `membership` limit is reported as a `Set`. The autofix wraps the initializer in `new Set(…)` and renames each `.includes` to `.has`, keeping the quotes of a computed key such as `['includes']`. Both methods compare with `SameValueZero`, and no other name holds the literal, so the fix preserves behavior. It needs all of these:
  - Every read is an `.includes` call.
  - The binding has no type annotation.
  - No local or imported value named `Set` shadows the global.
- An inline array above the limit is reported, and the message asks to hoist it into a module-level `Set`.
- A `Set`, `Map`, or object above its limit is left alone.

## Arrays of Other Values

An array that is no table, such as `[a, b]` or `rows.map(row => row.id)`, is reported as a `Set` when all of these hold:

- Every read is `A.includes(x)`.
- The search runs more than once: there are several reads, or the one read sits in a function or a loop.
- The initializer builds an array, or names one.

The rewrite is the same as above. It is an autofix when the initializer builds an array that no other name holds:

- An array literal, `new Array`, `Array`, `Array.from`, or `Array.of`.
- A method that returns a new array, such as `map`, `filter`, `slice`, `flat`, or `with`, on a known array.

It is a suggestion in the other cases, where a `Set` copy can behave differently:

- The initializer names an array that another binding holds, as in `const KNOWN = ITEMS`. A `Set` copy stops seeing later changes through `ITEMS`.
- It calls `sort`, `reverse`, `fill`, or `copyWithin`, which return their receiver, so another name can hold the same array.
- It calls a new-array method on a receiver that is not known to be an array. A string has `concat` and `slice` too, and a string's `.includes` searches for a substring.
- It calls `split`, `splice`, or `toArray`, which build a new array only on a string, an array, or an iterator. The rule cannot see the type of the receiver.

## Case Comparands

A key counts when a `switch` case can name it:

- A string, number, boolean, or bigint literal, a template literal without expressions, or a negated number.
- An identifier bound to a same-file `const` whose initializer is such a literal, also through `as const` or `satisfies`.
- A member `E.A` of a same-file `enum E`.
- A member `K.A` of a same-file `const K` object literal, optionally `as const`, whose property `A` is such a literal.

These do not count:

- `null`, `undefined`, and other references, which guard or narrow a value instead of naming a case. So `x === null || x === y` is not reported.
- One constant compared with two values, as in `x === A || y === A`.

## Type Information

With `typescript-eslint` type information, a comparand also counts when its type is a single literal type: a string, number, or bigint literal, `true`, `false`, or an enum member. This covers imported and declared constants, as in `declare const A: 'a'`. Unions such as `boolean` or a whole enum, `any`, `unknown`, and `never` do not count.

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

At 16 keys on V8, a `switch` takes this fraction of the time of `Set.has` or `Map.get`, with its 95% interval:

| Input                                | `switch` ÷ `Set.has` | `switch` ÷ `Map.get` |
| ------------------------------------ | -------------------- | -------------------- |
| New string each lookup               | 0.44 (0.39–0.56)     | 0.45 (0.38–0.57)     |
| Interned                             | 0.64 (0.62–0.68)     | 0.65 (0.59–0.79)     |
| New shared-prefix string each lookup | 0.75 (0.62–0.84)     | 0.87 (0.64–1.09)     |
| Same runtime string reused           | 4.47 (2.75–5.44)     | 3.04 (2.26–3.56)     |
| Small integers                       | 0.38 (0.30–0.47)     | 1.08 (0.84–1.23)     |

A new runtime string is the case that favors a `switch` most. On V8, `Set.has`, `Map.get`, and `obj[k]` take 55 to 80 ns on a string that no lookup has seen, while a `switch` over 2 keys takes about 13 ns. V8 compares the cases of a string `switch` one after another, so its cost grows with the key count and with a shared prefix: with 64 new shared-prefix strings, a `switch` takes about 210 ns.

### Defaults

The defaults are the largest key counts at which a `switch` is faster than or about even with a `Set`, a `Map`, or an object on V8 for interned strings, new strings, and small-integer membership, and on JSC for interned and new strings:

- `membership: 16` and `values: 16` hold for interned strings, for new strings, and for new shared-prefix strings, which turn slower at 24 keys.
- `dispatch: 24` holds on V8 for every scenario except the reused shared-prefix string, which turns slower at 8 to 12 keys.

Against an array, a `switch` and `includes` or `indexOf` both compare the entries one after another, and they stay within 2 times of each other at every size measured. The largest gap is V8's `indexOf` with new shared-prefix strings, 1.8 times faster than a `switch` at 32 keys.

The defaults cost speed in these cases:

- On V8, code that looks up the same runtime-built string again and again. A membership test turns slower than `Set.has` from 3 keys, or 2 with shared-prefix keys, and at 16 keys lookups run 3 to 4.5 times slower. With shared-prefix keys, value lookups turn slower from 2 to 4 keys and dispatch from 8 to 12 keys.
- On V8, value lookups with small integer keys run 1.1 to 1.25 times slower from 6 keys, although the intervals at 16 and 32 keys include 1.
- On JSC, small integer keys turn slower than `Set.has`, `Map.get`, `obj[k]`, and dispatch through a `Map` from 8 keys, and a reused runtime string makes `Object.hasOwn`, `obj[k]`, and dispatch through an object faster than a `switch` from 1 to 12 keys.

A project whose lookups mostly reuse runtime strings, or whose keys share long prefixes, can lower the limits. `{ membership: 2, values: 2, dispatch: 24 }` is not slower on V8 in any scenario except the reused shared-prefix string, and `{ membership: 1, values: 1, dispatch: 6 }` is not slower on V8 in any scenario.

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
- A bound `let` is not reported. An exported table is reported only through its lookups in its own file (see [Exported Tables](#exported-tables)).
