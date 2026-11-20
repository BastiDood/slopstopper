import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_FLAT_MAP_NULLISH_FALLBACK } from './index.ts';

OXLINT_RULE_TESTER.run('no-flat-map-nullish-fallback', NO_FLAT_MAP_NULLISH_FALLBACK, {
	valid: [
		// The explicit ternary form that `no-array-filter-map` recommends.
		'const emails = users.flatMap(user => (user.active ? [user.email] : []));',
		// A nullish fallback outside a `.flatMap` return is not reported.
		'const items = maybe ?? [];',
		'const lists = xs.map(x => x.items ?? []);',
		// A non-empty fallback and an `||` fallback are not reported.
		'const flat = xs.flatMap(x => x.items ?? defaults);',
		'const flat = xs.flatMap(x => x.items || []);',
		// The fallback belongs to a nested function, not to the callback.
		'const flat = xs.flatMap(x => { const items = () => x.items ?? []; return [items]; });',
		// The function is no callback of `.flatMap`.
		'const flat = xs.flatMap(identity, x => x ?? []);',
	],
	invalid: [
		{
			code: 'const summaries = runs.flatMap(({ baseline }) => baseline?.summary ?? []);',
			errors: nullishFallback('baseline?.summary ?? []', 'baseline?.summary'),
		},
		{
			code: 'const flat = xs.flatMap(x => (x.items ?? []) as Item[]);',
			errors: nullishFallback('x.items ?? []', 'x.items'),
		},
		{
			code: 'const flat = xs.flatMap(x => x.items ?? ([] as Item[]));',
			errors: nullishFallback('x.items ?? ([] as Item[])', 'x.items'),
		},
		{
			code: 'const flat = xs.flatMap(x => { const { items } = x; return items ?? []; });',
			errors: nullishFallback('items ?? []', 'items'),
		},
		{
			code: 'const flat = xs.flatMap(((x) => x.items ?? []) as (x: X) => Item[]);',
			errors: nullishFallback('x.items ?? []', 'x.items'),
		},
	],
});

UNTYPED_RULE_TESTER.run('no-flat-map-nullish-fallback', eslintRule(NO_FLAT_MAP_NULLISH_FALLBACK), {
	valid: [],
	invalid: [
		{
			code: 'const summaries = runs.flatMap(({ baseline }) => baseline?.summary ?? []);',
			errors: nullishFallback('baseline?.summary ?? []', 'baseline?.summary'),
		},
	],
});

function nullishFallback(fallback: string, value: string) {
	return [{ messageId: 'nullishFallback', data: { fallback, value } }];
}
