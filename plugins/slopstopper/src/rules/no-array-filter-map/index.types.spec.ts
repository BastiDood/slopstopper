import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { NO_ARRAY_FILTER_MAP } from './index.ts';

TYPED_RULE_TESTER.run('no-array-filter-map', eslintRule(NO_ARRAY_FILTER_MAP), {
	valid: [
		// `filter` resolves to the iterator helper of `IteratorObject`, which is lazy.
		'declare function load(): IteratorObject<number>; load().filter(x => x > 0).map(x => x * 2).toArray();',
	],
	invalid: [
		// Only the type checker proves that the result of `load()` is an array.
		{
			code: 'declare function load(): number[]; load().filter(x => x > 0).map(x => x * 2);',
			errors: [
				{
					messageId: 'arrayFilterMap',
					data: { receiver: 'load()', first: 'filter', second: 'map' },
				},
			],
		},
	],
});
