# `slopstopper/needless-type-intersection`

Reports a type alias of an intersection whose constituents are all object type literals or extendable type references. Declare an `interface ... extends` instead: interfaces report conflicting members instead of collapsing them to `never`, and the type checker caches them.

## Examples

Incorrect:

```ts
type X = Base & { a: 1 };
type Y = ns.Base & { a: 1 };
type Z<T> = Base<T> & { value: T };
```

Correct:

```ts
interface X extends Base {
	a: 1;
}
```

Not reported, because an interface cannot express them. [`no-alias-object-type`](../no-alias-object-type/README.md) reports their object type literals instead:

```ts
// Keyword constituents, such as branded primitives.
type UserId = string & { __brand: 'UserId' };

// A type parameter, which an interface cannot extend.
type W<T> = T & { a: 1 };

// A union constituent.
type V = Base & ({ a: 1 } | { b: 2 });

// An intersection that is not the alias's top-level type.
type U = (Base & { a: 1 }) | null;
```

Use `Pick`, `Omit`, or a named alias to give `extends` a single object type.

`no-alias-object-type` leaves the object type literals of an alias that this rule reports to this rule.

## Limitations

- References to names declared elsewhere, including imported names and `import('x').T`, are assumed extendable. TypeScript reports the ones that are not (TS2312) after you convert the alias.
- Only a reference to a type parameter in scope keeps the alias valid. Any other constituent kind (keywords, unions, mapped types, conditional types, tuples, function types, and so on) keeps it valid too.
- Only type aliases are checked. Intersections in parameter types or other positions are not reported.
