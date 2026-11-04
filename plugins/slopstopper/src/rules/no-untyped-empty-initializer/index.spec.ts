import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_UNTYPED_EMPTY_INITIALIZER } from './index.ts';

/** The placeholders of a message about an empty collection. */
interface CollectionData {
	name: string;
	inferred: string;
	parameters: string;
}

const MAP = { name: 'Map', inferred: 'Map<any, any>', parameters: 'Key, Value' };

OXLINT_RULE_TESTER.run('no-untyped-empty-initializer', NO_UNTYPED_EMPTY_INITIALIZER, {
	valid: [
		// An annotation provides the type.
		'let count: number;',
		'const items: string[] = [];',
		'class Store { items: string[] = []; }',
		'function run(items: string[] = []) {}',
		'interface Options { readonly items?: string[] } function run({ items = [] }: Options) {}',
		// A callback may get a contextual type from the call.
		'declare const lists: string[][]; lists.forEach((list = []) => list);',
		// A destructuring declaration gets its types from the destructured value.
		'declare const options: { readonly items?: string[] }; const { items = [] } = options;',
		// An empty literal elsewhere gets its type from where it appears.
		'declare function use(items: string[]): void; use([]);',
		'const pair = [1, 2];',
		// Constructor arguments and type arguments provide the types.
		'declare const entries: [string, number][]; const cache = new Map(entries);',
		'const cache = new Map<string, number>();',
		'const date = new Date();',
		// A local `Map` is not the global collection.
		'class Map {} const cache = new Map();',
		'const items = [] as const;',
		// A loop head takes its values from the loop, and an ambient declaration has none.
		'declare const options: { readonly verbose: boolean }; for (const key in options) key;',
		'declare let count;',
	],
	invalid: [
		{ code: 'let count;', errors: [binding('uninitialized', 'count')] },
		{ code: 'const items = [];', errors: [binding('emptyArray', 'items')] },
		{ code: 'let config = {};', errors: [binding('emptyObject', 'config')] },
		{ code: 'let selected = null;', errors: [binding('nullValue', 'selected')] },
		{ code: 'class Store { #items = []; }', errors: [binding('emptyArray', '#items')] },
		{ code: 'function run(items = []) {}', errors: [binding('emptyArrayDefault', 'items')] },
		{
			code: 'function run({ options = {} }) {}',
			errors: [binding('emptyObjectDefault', 'options')],
		},
		{
			code: 'class Runner { run(items = []) {} }',
			errors: [binding('emptyArrayDefault', 'items')],
		},
		{
			code: 'const run = (items = []) => items;',
			errors: [binding('emptyArrayDefault', 'items')],
		},
		{
			code: 'class Runner { constructor(readonly items = []) {} }',
			errors: [binding('emptyArrayDefault', 'items')],
		},
		// An annotation does not replace the type arguments.
		{
			code: 'const cache: Map<string, number> = new Map();',
			errors: [collection(MAP)],
		},
		{
			code: 'const owners = new WeakMap(); const seen = new Set();',
			errors: [
				collection({
					name: 'WeakMap',
					inferred: 'WeakMap<WeakKey, any>',
					parameters: 'Key, Value',
				}),
				collection({ name: 'Set', inferred: 'Set<unknown>', parameters: 'Element' }),
			],
		},
		{ code: 'const items = [] as string[];', errors: [assertion('[]')] },
		{ code: 'const options = <object>{};', errors: [assertion('{}')] },
	],
});

UNTYPED_RULE_TESTER.run('no-untyped-empty-initializer', eslintRule(NO_UNTYPED_EMPTY_INITIALIZER), {
	valid: [],
	invalid: [
		// Without an annotation, typescript-estree omits the field instead of setting it to `null`.
		{
			code: 'const items = []; const cache = new Map();',
			errors: [binding('emptyArray', 'items'), collection(MAP)],
		},
	],
});

function binding(messageId: string, name: string) {
	return { messageId, data: { name } };
}

function collection(data: CollectionData) {
	return { messageId: 'emptyCollection', data };
}

function assertion(value: string) {
	return { messageId: 'emptyAssertion', data: { value } };
}
