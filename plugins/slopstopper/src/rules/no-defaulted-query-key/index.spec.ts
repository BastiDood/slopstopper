import {
	eslintRule,
	SVELTE_RULE_TESTER,
	UNTYPED_RULE_TESTER,
} from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_DEFAULTED_QUERY_KEY } from './index.ts';

OXLINT_RULE_TESTER.run('no-defaulted-query-key', NO_DEFAULTED_QUERY_KEY, {
	valid: [
		// Another operator, bindings without a default, and a binding with two definitions.
		"function f(id, a, b) { const both = a && b; var twice; var twice; return useQuery({ queryKey: ['job', id, both, twice], queryFn }); }",
		// Defaults inside a function nested in the key, and outside any key or function.
		"useQuery({ queryKey: ['jobs', ids.map((id = 0) => id ?? 0)], queryFn, meta: { id: id ?? 0 } });",
	],
	invalid: [
		// The arguments of a key factory call, behind an assertion; `id` inside the reported default is not reported again.
		{
			code: "function f(id) { return useQuery({ queryKey: keys.detail(id ?? 'none') as const, queryFn }); }",
			errors: expression("id ?? 'none'"),
		},
		// A nested default is reported once, without the defaulted binding inside it.
		{
			code: "function f(a, b, c = 0) { return queryOptions({ queryKey: ['job', (a || b) ?? c], queryFn }); }",
			errors: expression('(a || b) ?? c'),
		},
		// A parameter default, and a `const` default directly and through an alias.
		{
			code: "function f(id, page = 1) { const jobId = id ?? 0; const alias = jobId; return useQuery({ queryKey: ['jobs', page, jobId, alias], queryFn }); }",
			errors: [...binding('page'), ...binding('jobId'), ...binding('alias')],
		},
	],
});

UNTYPED_RULE_TESTER.run('no-defaulted-query-key', eslintRule(NO_DEFAULTED_QUERY_KEY), {
	valid: [],
	invalid: [
		{
			code: "function f(id: string | undefined, page: number = 1) { return useQuery({ queryKey: ['job', id ?? 'none', page], queryFn }); }",
			errors: [...expression("id ?? 'none'"), ...binding('page')],
		},
	],
});

SVELTE_RULE_TESTER.run('no-defaulted-query-key', eslintRule(NO_DEFAULTED_QUERY_KEY), {
	valid: [],
	invalid: [
		{
			filename: 'Jobs.svelte',
			code: '<script lang="ts">let { id, page = 1 } = $props(); const q = createQuery(() => ({ queryKey: [\'jobs\', id, page], queryFn: () => list(id ?? 0, page) }));</script>',
			errors: binding('page'),
		},
	],
});

function expression(value: string) {
	return [{ messageId: 'defaultedExpression', data: { value } }];
}

function binding(value: string) {
	return [{ messageId: 'defaultedBinding', data: { value } }];
}
