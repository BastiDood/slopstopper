import type { Entry } from '#compose/index.ts';

const STOCK_FEATURES_MESSAGE =
	'Register only the features that this table uses in `tableFeatures({...})`. `stockFeatures` hides which features the table depends on and keeps every unused feature in the bundle. Do not suppress this.';

const RAW_TEMPLATE_MESSAGE =
	'Render through `FlexRender` with `cell`, `header`, or `footer` instead of reading the column template. For cells, it renders `aggregatedCell` and skips placeholders, and calling a template directly runs its hooks in the calling component. For a column label, use `column.id` or a label map.';

/** TanStack Table rules that apply to every framework adapter. */
export const TANSTACK_TABLE = {
	config: { rules: {} },
	restrictions: {
		importPaths: [
			{
				name: '@tanstack/table-core',
				importNames: ['stockFeatures'],
				message: STOCK_FEATURES_MESSAGE,
			},
			{
				name: '@tanstack/react-table',
				importNames: ['stockFeatures'],
				message: STOCK_FEATURES_MESSAGE,
			},
			{
				name: '@tanstack/svelte-table',
				importNames: ['stockFeatures'],
				message: STOCK_FEATURES_MESSAGE,
			},
		],
		syntax: [
			{
				selector:
					'MemberExpression[property.name=/^(?:cell|header|footer|aggregatedCell)$/]:matches([object.name="columnDef"], [object.property.name="columnDef"])',
				message: RAW_TEMPLATE_MESSAGE,
			},
			{
				selector:
					'VariableDeclarator:matches([init.name="columnDef"], [init.property.name="columnDef"]) > ObjectPattern > Property[key.name=/^(?:cell|header|footer|aggregatedCell)$/]',
				message: RAW_TEMPLATE_MESSAGE,
			},
			{
				selector:
					'Property[key.name="columnDef"] > ObjectPattern > Property[key.name=/^(?:cell|header|footer|aggregatedCell)$/]',
				message: RAW_TEMPLATE_MESSAGE,
			},
		],
	},
} satisfies Entry;
