import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_UNSAFE_DICTIONARY_TYPE } from './index.ts';

OXLINT_RULE_TESTER.run('no-unsafe-dictionary-type', NO_UNSAFE_DICTIONARY_TYPE, {
	valid: [
		'type Indexes = { [index: number]: Command; [key: string]: Command | Other };',
		'type Exhaustive = { [K in Permission]: number };',
		// A default may reference an earlier type parameter.
		'type Value<T> = T; type Index<T = Command, U = Value<T>> = Record<string, U>; type A = Index;',
		'interface Owner { readonly id: string } type A = Record<string, unknown & Owner>;',
		'interface Owner { readonly id: string } interface Child extends Owner {} type A = Record<string, Child>;',
		// Merged interface declarations are no empty interface.
		'interface Escape {} interface Escape { readonly id: string } type A = Record<string, Escape>;',
		// `T` and `U` of `f` are not the type parameters of `Outer` and `Inner`.
		'type Wrap<T> = { readonly wrapped: T }; type Inner<T, U> = { readonly value: T } & Wrap<U>; type Outer<T, U> = Record<string, Inner<T, U>>; declare function f<T, U>(): Outer<T, U>;',
		// A type parameter constraint is exempt.
		'type Deep<T extends Readonly<Record<string, unknown>>> = T;',
		// A recursive alias ends.
		'type Tree = Record<string, Tree>;',
	],
	invalid: [
		{
			code: 'type A = { [i: number]: C; [k: string]: any | C };',
			errors: on(['{ [i: number]: C; [k: string]: any | C }', 'any | C']),
		},
		{
			code: 'type A = { [K in PropertyKey]: object };',
			errors: on(['{ [K in PropertyKey]: object }', 'object']),
		},
		// An object type whose every member is an optional `never` accepts any object.
		{
			code: 'interface Escape { readonly brand?: never } type A = Record<string, Escape>;',
			errors: on(['Record<string, Escape>', 'Escape']),
		},
		{
			code: 'type A = Record<string, { a?: never }>;',
			errors: on(['Record<string, { a?: never }>', '{ a?: never }']),
		},
		{
			code: 'type A = Record<string, unknown & {}>;',
			errors: on(['Record<string, unknown & {}>', 'unknown & {}']),
		},
		{
			code: 'interface Owner { id: string } type A = Record<string, any & Owner>;',
			errors: on(['Record<string, any & Owner>', 'any & Owner']),
		},
		// The value names the type that the alias expands to.
		{
			code: 'type Escape = unknown; type A = Record<string, Escape>;',
			errors: on(['Record<string, Escape>', 'unknown']),
		},
		// Only the outermost wrapper reports.
		{
			code: 'type A = Readonly<Partial<Record<K, unknown>>>;',
			errors: on(['Readonly<Partial<Record<K, unknown>>>', 'unknown']),
		},
		{
			code: 'type A = Record<string, Readonly<unknown>>;',
			errors: on(['Record<string, Readonly<unknown>>', 'Readonly<unknown>']),
		},
		{
			code: 'type Source = Record<string, unknown>; type A = Pick<Source, string>;',
			errors: on(['Record<string, unknown>', 'unknown'], ['Pick<Source, string>', 'unknown']),
		},
		{
			code: 'type Index<T = unknown> = Record<string, T>; type A = Index;',
			errors: on(['Index', 'unknown']),
		},
		{
			code: 'type Index<T, U = T> = Record<string, U>; type A = Index<unknown>;',
			errors: on(['Index<unknown>', 'unknown']),
		},
		// An index signature outside an object type reports on its own.
		{
			code: 'interface A { [key: string]: unknown }',
			errors: on(['[key: string]: unknown', 'unknown']),
		},
		// A plain reference to an unsafe alias reports only inside a type alias.
		{
			code: 'type Unsafe = Record<string, unknown>; type AlsoUnsafe = Unsafe; const x: Unsafe = {};',
			errors: on(['Record<string, unknown>', 'unknown'], ['Unsafe', 'unknown']),
		},
		// The local `Record` alias shadows the global only in its own scope.
		{
			code: 'function local() { type Record<K, V> = { key: K; value: V }; type A = Record<string, unknown>; } function global() { type A = Record<string, unknown>; }',
			errors: on(['Record<string, unknown>', 'unknown']),
		},
	],
});

UNTYPED_RULE_TESTER.run('no-unsafe-dictionary-type', eslintRule(NO_UNSAFE_DICTIONARY_TYPE), {
	valid: [
		// A mapped type without a value type declares no value.
		'type A = { [K in string] };',
	],
	invalid: [
		// A plain reference to an unsafe alias reports only inside a type alias.
		{
			code: 'type Unsafe = Record<string, unknown>; const x: Unsafe = {};',
			errors: on(['Record<string, unknown>', 'unknown']),
		},
		{
			code: 'type Index<T> = Record<string, T>; type A = Index<unknown>;',
			errors: on(['Index<unknown>', 'unknown']),
		},
	],
});

function on(...reports: [dictionary: string, value: string][]) {
	return reports.map(([dictionary, value]) => ({
		messageId: 'unsafeDictionary',
		data: { dictionary, value },
	}));
}
