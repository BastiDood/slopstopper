import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_UNKNOWN_RETURNS } from './index.ts';

OXLINT_RULE_TESTER.run('no-unknown-returns', NO_UNKNOWN_RETURNS, {
	valid: [
		'function generic<Value>(): Value { return value; }',
		// The mapped type's key `Key` shadows the alias `Key`.
		'type Key = unknown; type Mapped<Input> = { [Key in keyof Input]: () => Key };',
		// The `infer Item` of the true branch shadows the alias `Item`.
		'type Item = unknown; type Unpacked<Input> = Input extends Promise<infer Item> ? () => Item : never;',
		// `unknown` nested in a field stays visible to the caller.
		'function cause(): { cause: unknown } { return { cause: input }; }',
		'function load(): Promise<User> { return promise; }',
		'type Identity<T> = T; function load(): Identity<User> { return user; }',
		// The local alias `Value` shadows the module alias.
		'type Value = unknown; function outer() { type Value = User; function load(): Value { return user; } }',
		// A local `Promise` is no global promise.
		'interface Promise<T> { value: T } function load(): Promise<unknown> { return promise; }',
	],
	invalid: [
		{ code: 'const load = (): unknown => input;', errors: on('unknown', '`load`') },
		{ code: 'type Loader = () => unknown;', errors: on('unknown', 'this function') },
		{ code: 'interface Loader { load(): unknown }', errors: on('unknown', '`load`') },
		{ code: 'declare function load(): unknown;', errors: on('unknown', '`load`') },
		{
			code: 'class Loader { load(): unknown; load(): unknown { return input; } }',
			errors: [...on('unknown', '`load`'), ...on('unknown', '`load`')],
		},
		{
			code: 'function load(): string | unknown { return input; }',
			errors: on('string | unknown', '`load`'),
		},
		{
			code: 'function load(): PromiseLike<unknown> { return promise; }',
			errors: on('PromiseLike<unknown>', '`load`'),
		},
		{
			code: 'type UnknownValue = unknown; function load(): UnknownValue { return input; }',
			errors: on('UnknownValue', '`load`'),
		},
		// The `infer Item` binds only in the true branch, so the false branch reads the alias.
		{
			code: 'type Item = unknown; type Fallback<Input> = Input extends infer Item ? string : () => Item;',
			errors: on('Item', 'this function'),
		},
		{
			code: 'function outer() { type Result = unknown; function load(): Result { return input; } }',
			errors: on('Result', '`load`'),
		},
		{
			code: 'type Identity<T> = T; type Wrapped<T> = Promise<Identity<T>>; function load(): Wrapped<unknown> { return promise; }',
			errors: on('Wrapped<unknown>', '`load`'),
		},
	],
});

UNTYPED_RULE_TESTER.run('no-unknown-returns', eslintRule(NO_UNKNOWN_RETURNS), {
	valid: [],
	invalid: [
		{
			code: 'function load(): Promise<unknown> { return promise; }',
			errors: on('Promise<unknown>', '`load`'),
		},
	],
});

function on(type: string, label: string) {
	return [{ messageId: 'unknownReturn', data: { type, function: label } }];
}
