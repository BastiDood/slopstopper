import {
	eslintRule,
	SVELTE_RULE_TESTER,
	UNTYPED_RULE_TESTER,
} from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_QUERY_KEY_CONTEXT } from './index.ts';

/** The repeated key call is reported once, unlike a call with other tokens or another binding of `id`. */
const REPEATED_CALL =
	'function f(id) { return useQuery({ queryKey: keys.detail(id), queryFn: () => get(keys.detail( id ), keys.detail(0), keys.detail(0, 1), ids.map(id => keys.detail(id))) }); }';

OXLINT_RULE_TESTER.run('prefer-query-key-context', PREFER_QUERY_KEY_CONTEXT, {
	valid: [
		// A callee or a dynamic read in the key holds no binding, and a global holds no variable.
		'function f(items, i) { return useQuery({ queryKey: [keys.detail(i), items[i], globalKey], queryFn: () => keys.other(items[0]) }); }',
		// No `queryFn`, and no inline `queryFn`.
		"function f(id) { invalidate({ queryKey: ['job', id] }); return useQuery({ queryKey: ['job', id], queryFn: fetchJob }); }",
	],
	invalid: [
		// A key that holds the whole binding reports every read of it, and a `.queryKey` read on a captured object.
		{
			code: "function f(filters) { return useQuery({ queryKey: ['jobs', filters], queryFn: () => list(filters?.status, opts.queryKey) }); }",
			errors: [...on('filters'), ...on('opts.queryKey')],
		},
		// A key that holds a member path reports that path, but not another member of the binding.
		{
			code: "function f(filters) { return useQuery({ queryKey: ['jobs', filters.status], queryFn: () => list(filters.status, filters.sort) }); }",
			errors: on('filters.status'),
		},
		{ code: REPEATED_CALL, errors: on('keys.detail( id )') },
	],
});

UNTYPED_RULE_TESTER.run('prefer-query-key-context', eslintRule(PREFER_QUERY_KEY_CONTEXT), {
	valid: [
		// A type that the key names is no value.
		"function f(id) { return useQuery({ queryKey: ['job', id] as Key, queryFn: ({ queryKey }) => get(queryKey as Key) }); }",
	],
	invalid: [{ code: REPEATED_CALL, errors: on('keys.detail( id )') }],
});

SVELTE_RULE_TESTER.run('prefer-query-key-context', eslintRule(PREFER_QUERY_KEY_CONTEXT), {
	valid: [],
	invalid: [
		// The context parameter shadows `page`.
		{
			filename: 'Job.svelte',
			code: '<script lang="ts">let { id, page } = $props(); const q = createQuery(() => ({ queryKey: [\'job\', id, page], queryFn: ({ queryKey: [, , page] }) => fetchJob(id, page) }));</script>',
			errors: on('id'),
		},
	],
});

function on(value: string) {
	return [{ messageId: 'readFromContext', data: { value } }];
}
