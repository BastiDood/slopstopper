import {
	eslintRule,
	SVELTE_RULE_TESTER,
	UNTYPED_RULE_TESTER,
} from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { REQUIRE_TABLE_STATE_PAIRS } from './index.ts';

const RULE = eslintRule(REQUIRE_TABLE_STATE_PAIRS);

OXLINT_RULE_TESTER.run('require-table-state-pairs', REQUIRE_TABLE_STATE_PAIRS, {
	valid: [
		// Svelte options read state through getters.
		'createTable({ get state() { return { sorting }; }, onSortingChange: setSorting });',
		// Keys that a spread, a computed key, or an opaque value hides exempt the checks that need them.
		'useTable({ ...base, state: { pagination } }); useTable({ [key]: value, state: { pagination } }); useTable({ state, onPaginationChange: setPagination });',
		// A getter whose body is no single `return` of an object literal.
		'createTable({ get state() { log(); return { sorting }; }, onPaginationChange: setPagination }); createTable({ get state() { return current; }, onPaginationChange: setPagination });',
		// Another function, or options that are no object literal.
		'configure({ state: { pagination } }); useTable(options); useTable(...args);',
	],
	invalid: [
		{
			code: 'useTable({ data, columns, onRowSelectionChange: setRowSelection });',
			errors: [missingState('rowSelection', 'onRowSelectionChange')],
		},
		// Opaque atoms still leave a state entry without its handler.
		{
			code: 'createTable({ atoms, state: { sorting } });',
			errors: [missingHandler('sorting', 'onSortingChange')],
		},
	],
});

UNTYPED_RULE_TESTER.run('require-table-state-pairs', RULE, {
	valid: ['useTable({ state: { sorting }, onSortingChange: setSorting });'],
	invalid: [
		{
			code: 'useTable({ state: { sorting } });',
			errors: [missingHandler('sorting', 'onSortingChange')],
		},
	],
});

SVELTE_RULE_TESTER.run('require-table-state-pairs', RULE, {
	valid: [
		{
			code: '<script lang="ts">\n\tconst table = createTable({\n\t\tstate: { get pagination() { return pagination(); } },\n\t\tonPaginationChange: setPagination,\n\t});\n</script>',
			filename: 'Table.svelte',
		},
	],
	invalid: [
		{
			code: '<script lang="ts">\n\tconst table = createTable({\n\t\tstate: { get pagination() { return pagination(); } },\n\t});\n</script>',
			filename: 'Table.svelte',
			errors: [missingHandler('pagination', 'onPaginationChange')],
		},
	],
});

function missingHandler(slice: string, handler: string) {
	return { messageId: 'missingHandler', data: { slice, handler } };
}

function missingState(slice: string, handler: string) {
	return { messageId: 'missingState', data: { slice, handler } };
}
