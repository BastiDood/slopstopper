# `slopstopper/no-untyped-empty-initializer`

Reports a binding, an empty literal, or an empty collection that TypeScript cannot infer a useful type from, and asks for an initializer, an explicit type annotation, or type arguments instead:

- A variable without an initializer or an annotation, as in `let x;`, whose type evolves with later assignments. The declarators in the head of a `for…in` or `for…of` loop and an ambient `declare` declaration are exempt. The rule replaces `typescript/init-declarations`, which also bans the annotated `let x: T;`.
- A variable or class property without an annotation that starts as `[]`, `{}`, or `null`. An empty array evolves into whatever gets pushed, `{}` accepts every value except `null` and `undefined`, and `null` says nothing about the values that the binding holds later.
- A parameter or destructuring default `[]` or `{}` on a binding without an annotation, where TypeScript infers `never[]` or `{}`. Only a default without a contextual type counts: one in a function declaration, a class method, or a function that initializes an unannotated binding, inside parameter patterns without an annotation.
- A global `new Map()`, `new WeakMap()`, or `new Set()` without type arguments or constructor arguments, which infers `Map<any, any>`, `WeakMap<WeakKey, any>`, or `Set<unknown>`. An annotation on the receiving binding does not count: the type arguments belong on the constructor, and the binding infers its type from them.
- A type assertion on `[]`, `{}`, or `null`, other than `as const`. This rule owns these assertions, and `no-known-value-widening` skips them, because `satisfies` would keep the empty type.

## Examples

Incorrect:

```ts
let count;
const items = [];
let selected = null;
const cache = new Map();
const options = {} as Options;

function render(rows = []) {}
```

Correct:

```ts
let count: number;
const items: Item[] = [];
let selected: Item | null = null;
const cache = new Map<string, Item>();
const options: Options = {};
const [state, setState] = useState<Item[]>([]);
const empty = [] as const;

function render(rows: Row[] = []) {}
```

## Limitations

- The rule checks syntax only. A constructor in any other position that gives it a contextual type, such as a call argument, is still reported.
- A default in a callback, an object literal method, or another function that may get a contextual type is not reported.
- A `satisfies` expression on an empty literal is not reported.
