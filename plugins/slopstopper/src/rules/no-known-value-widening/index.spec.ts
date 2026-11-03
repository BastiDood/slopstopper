import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_KNOWN_VALUE_WIDENING } from './index.ts';

/** The placeholders of a message about a value that flows into an annotated destination. */
interface FlowData {
	type: string;
	subject: string;
	value: string;
}

const PRELUDE = 'type Command = () => void; const startCommand = () => {};';
const VALUE = '{ start: startCommand }';
const GUARD = 'function isString(value: unknown): value is string { return true; }';

OXLINT_RULE_TESTER.run('no-known-value-widening', NO_KNOWN_VALUE_WIDENING, {
	valid: [
		// An empty object literal may start an open dictionary.
		`${PRELUDE} const commands: Record<string, Command> = {};`,
		`${PRELUDE} type Index<T> = Record<string, T>; const commands: Index<Command> = {};`,
		`${PRELUDE} const commands = {} as Record<string, Command>;`,
		`${PRELUDE} const commands = ${VALUE} as const;`,
		// A named type is a contract, even when it aliases an anonymous object type.
		`${PRELUDE} interface Commands { readonly start: Command } const commands: Commands = ${VALUE};`,
		`${PRELUDE} type Commands = { readonly start: Command }; const commands: Commands = ${VALUE};`,
		`${PRELUDE} type Levels = { readonly [Level in Permission]: number }; const levels: Levels = { admin: 1 };`,
		// A call result has no known type of its own.
		`${PRELUDE} declare function make(): Record<string, Command>; const commands: Record<string, Command> = make();`,
		// Keys that the value spells out keep the dictionary closed.
		"type Diet = 'vegan' | 'omnivore'; const labels: Record<Diet, string> = { vegan: 'V', omnivore: 'O' };",
		`${PRELUDE} type Index<Key extends PropertyKey, Value> = Record<Key, Value>; const commands: Index<'start', Command> = ${VALUE};`,
		// The guard narrows values whose type is not known yet.
		`${GUARD} declare const input: unknown; isString(input);`,
		`${GUARD} declare function readInput(): unknown; isString(readInput());`,
		// A callee that a parameter binds is no same-file function, even inside a function with an informative return type.
		`${GUARD} function run(read: () => unknown): string { const input = read(); isString(input); return ''; }`,
	],
	invalid: [
		{
			code: 'const value: unknown = 1;',
			errors: [annotation({ type: 'unknown', subject: '`value`', value: '1' })],
		},
		{
			code: 'const value: object = [];',
			errors: [annotation({ type: 'object', subject: '`value`', value: '[]' })],
		},
		{
			code: 'let value: unknown; value = {};',
			errors: [
				{
					messageId: 'assignment',
					data: { type: 'unknown', subject: '`value`', value: '{}' },
				},
			],
		},
		{
			code: 'function create(): unknown { return {}; }',
			errors: [returnValue({ type: 'unknown', subject: '`create`', value: '{}' })],
		},
		{
			code: 'const create = (): object => [];',
			errors: [returnValue({ type: 'object', subject: '`create`', value: '[]' })],
		},
		{
			code: `${PRELUDE} const commands: { [key: string]: Command } = ${VALUE};`,
			errors: [
				annotation({
					type: '{ [key: string]: Command }',
					subject: '`commands`',
					value: VALUE,
				}),
			],
		},
		{
			code: `${PRELUDE} const commands: { start: Command } = ${VALUE};`,
			errors: [
				annotation({ type: '{ start: Command }', subject: '`commands`', value: VALUE }),
			],
		},
		{
			code: `${PRELUDE} class Registry { #commands: Record<string, Command> = ${VALUE}; }`,
			errors: [
				annotation({
					type: 'Record<string, Command>',
					subject: '`#commands`',
					value: VALUE,
				}),
			],
		},
		{
			code: `${PRELUDE} const commands = ${VALUE} as Record<string, Command>;`,
			errors: [
				assertion('Record<string, Command>', VALUE, [
					`${PRELUDE} const commands = ${VALUE} satisfies Record<string, Command>;`,
				]),
			],
		},
		// Only the outermost of chained assertions reports.
		{
			code: `${PRELUDE} const commands = (${VALUE} as Record<string, Command>) as object;`,
			errors: [
				assertion('object', `${VALUE} as Record<strin…`, [
					`${PRELUDE} const commands = (${VALUE} as Record<string, Command>) satisfies object;`,
				]),
			],
		},
		// An angle-bracket assertion has no suggestion.
		{
			code: 'const value = <object>{ a: 1 };',
			errors: [{ messageId: 'assertion', data: { type: 'object', value: '{ a: 1 }' } }],
		},
		// A `const` binding carries the known type of its initializer.
		{
			code: `${PRELUDE} const source = ${VALUE}; const commands: Record<string, Command> = source;`,
			errors: [
				annotation({
					type: 'Record<string, Command>',
					subject: '`commands`',
					value: 'source',
				}),
			],
		},
		{
			code: `${PRELUDE} type Open = Record<string, Command>; const commands: Open = ${VALUE};`,
			errors: [annotation({ type: 'Open', subject: '`commands`', value: VALUE })],
		},
		{
			code: `${PRELUDE} type Open = { [key in string]: Command }; const commands: Open = ${VALUE};`,
			errors: [annotation({ type: 'Open', subject: '`commands`', value: VALUE })],
		},
		{
			code: `${PRELUDE} type Identity<T> = T; const commands: Identity<Record<string, Command>> = ${VALUE};`,
			errors: [
				annotation({
					type: 'Identity<Record<string, Command>>',
					subject: '`commands`',
					value: VALUE,
				}),
			],
		},
		{
			code: `${PRELUDE} type Key = string; const commands: Record<Key, Command> = ${VALUE};`,
			errors: [
				annotation({ type: 'Record<Key, Command>', subject: '`commands`', value: VALUE }),
			],
		},
		{
			code: `${PRELUDE} const commands: Record<PropertyKey, Command> = ${VALUE};`,
			errors: [
				annotation({
					type: 'Record<PropertyKey, Command>',
					subject: '`commands`',
					value: VALUE,
				}),
			],
		},
		{
			code: `${GUARD} const known = 'known'; isString(known);`,
			errors: [guardArgument('known', '`isString`')],
		},
		{
			code: "function isString(value: string | unknown): value is string { return true; } isString('known');",
			errors: [guardArgument("'known'", '`isString`')],
		},
		{
			code: `${GUARD} function check(known: string) { return isString(known); }`,
			errors: [guardArgument('known', '`isString`')],
		},
		{
			code: 'const isString = (value: unknown): value is string => true; const known: string = getValue(); isString(known);',
			errors: [guardArgument('known', '`isString`')],
		},
		// A call of a same-file function with an informative return type carries that type.
		{
			code: "interface User { readonly id: string } function isUser(value: unknown): value is User { return true; } function parse(): User { return { id: 'known' }; } const user = parse(); isUser(user);",
			errors: [guardArgument('user', '`isUser`')],
		},
	],
});

UNTYPED_RULE_TESTER.run('no-known-value-widening', eslintRule(NO_KNOWN_VALUE_WIDENING), {
	valid: [],
	invalid: [
		// A non-generic alias widens when it resolves to `unknown`.
		{
			code: 'type Anything = unknown; const count: Anything = 1;',
			errors: [annotation({ type: 'Anything', subject: '`count`', value: '1' })],
		},
		{
			code: `${PRELUDE} const commands: Record<string, Command> = ${VALUE};`,
			errors: [
				annotation({
					type: 'Record<string, Command>',
					subject: '`commands`',
					value: VALUE,
				}),
			],
		},
	],
});

function annotation({ type, subject, value }: FlowData) {
	return { messageId: 'annotation', data: { type, subject, value } };
}

function returnValue({ type, subject, value }: FlowData) {
	return { messageId: 'returnValue', data: { type, subject, value } };
}

function assertion(type: string, value: string, outputs: string[]) {
	return {
		messageId: 'assertion',
		data: { type, value },
		suggestions: outputs.map(output => ({ messageId: 'replaceWithSatisfies', output })),
	};
}

function guardArgument(value: string, subject: string) {
	return { messageId: 'guardArgument', data: { value, parameter: 'value', subject } };
}
