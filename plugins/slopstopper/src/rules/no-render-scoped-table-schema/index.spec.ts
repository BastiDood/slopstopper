import {
	eslintRule,
	SVELTE_RULE_TESTER,
	UNTYPED_RULE_TESTER,
} from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_RENDER_SCOPED_TABLE_SCHEMA } from './index.ts';

const TSX = { languageOptions: { parserOptions: { lang: 'tsx' } } } as const;

const IMPORTS = "import { createColumnHelper, tableFeatures } from '@tanstack/react-table';";

OXLINT_RULE_TESTER.run('no-render-scoped-table-schema', NO_RENDER_SCOPED_TABLE_SCHEMA, {
	valid: [
		// The schema lives at module scope, or in a function that is neither a component nor a hook, including an unnamed one.
		`${IMPORTS} const helper = createColumnHelper(); const columns = helper.columns([]); function buildFeatures() { return tableFeatures({}); } function Table() { return useTable({ columns }); } register(() => tableFeatures({})); export default function () { return tableFeatures({}); }`,
		// A `useMemo` callback builds the schema once per mount.
		`${IMPORTS} function Table() { return useMemo(() => tableFeatures({}), []); } const useFeatures = () => React.useMemo(() => tableFeatures({}), []);`,
		// A local binding shadows `tableFeatures`, and `columns` is called on something other than a helper: a parameter, an
		// undeclared name, a member, and another call.
		`${IMPORTS} function Table(helper) { function tableFeatures() {} return [tableFeatures({}), helper.columns([]), undeclared.columns([]), this.helper.columns([]), makeHelper().columns([])]; }`,
	],
	invalid: [
		{
			code: `${IMPORTS} function Table() { const features = tableFeatures({}); return <DataTable features={features} />; }`,
			...TSX,
			errors: [render('tableFeatures(…)', 'Table')],
		},
		// An undeclared global counts, and a hook is an owner too.
		{
			code: 'const useTableSchema = () => { const helper = createColumnHelper(); return helper.columns([]); };',
			errors: [
				render('createColumnHelper(…)', 'useTableSchema'),
				render('helper.columns(…)', 'useTableSchema'),
			],
		},
		// The helper is found through a `const` alias, and the owner through a `memo(…)` wrapper, past a callback that is
		// not a `useMemo` callback.
		{
			code: `${IMPORTS} const helper = createColumnHelper(); const alias = helper; const Table = memo(function () { const columns = useCallback(() => alias.columns([]), []); });`,
			errors: [render('alias.columns(…)', 'Table')],
		},
	],
});

UNTYPED_RULE_TESTER.run(
	'no-render-scoped-table-schema',
	eslintRule(NO_RENDER_SCOPED_TABLE_SCHEMA),
	{
		valid: [],
		invalid: [
			{
				code: `${IMPORTS} function Table() { const features = tableFeatures({}); return <DataTable features={features} />; }`,
				filename: 'Table.tsx',
				errors: [render('tableFeatures(…)', 'Table')],
			},
		],
	},
);

SVELTE_RULE_TESTER.run('no-render-scoped-table-schema', eslintRule(NO_RENDER_SCOPED_TABLE_SCHEMA), {
	valid: [
		// The legacy module script.
		{
			code: `<script context="module" lang="ts">${IMPORTS} const features = tableFeatures({});</script>`,
			filename: 'Table.svelte',
		},
	],
	invalid: [
		// The module script may build the schema; the instance script may not.
		{
			code: `<script module lang="ts">${IMPORTS} const helper = createColumnHelper<Person>();</script>\n<script lang="ts">const columns = helper.columns([]); const table = createTable({ columns });</script>`,
			filename: 'Table.svelte',
			errors: [instance('helper.columns(…)')],
		},
	],
});

function render(call: string, owner: string) {
	return { messageId: 'render', data: { call, owner } };
}

function instance(call: string) {
	return { messageId: 'instance', data: { call } };
}
