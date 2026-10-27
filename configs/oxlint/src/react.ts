import type { Entry } from './compose/index.ts';

export const REACT = {
	config: {
		plugins: ['react', 'react-perf'],
		rules: {
			'react-perf/jsx-no-jsx-as-prop': 'error',
			'react-perf/jsx-no-new-array-as-prop': 'error',
			'react-perf/jsx-no-new-function-as-prop': 'error',
			'react-perf/jsx-no-new-object-as-prop': 'error',
			'react/button-has-type': 'error',
			'react/checked-requires-onchange-or-readonly': 'error',
			'react/exhaustive-deps': 'error',
			'react/hook-use-state': 'error',
			'react/jsx-curly-brace-presence': 'error',
			'react/jsx-no-target-blank': 'error',
			'react/jsx-no-useless-fragment': 'error',
			'react/react-in-jsx-scope': 'off',
			'react/rules-of-hooks': 'error',
			'react/self-closing-comp': 'error',
		},
	},
	restrictions: {
		importPaths: [
			{
				name: 'react',
				importNames: ['useEffect', 'useInsertionEffect', 'useLayoutEffect'],
				message:
					'Keep side effects in event handlers or the owner of external synchronization instead of an effect hook.',
			},
			{
				name: 'react',
				importNames: ['default', '*'],
				message:
					'Import React APIs directly by name and React types with `import type` instead of importing React as a default or namespace.',
			},
		],
		syntax: [
			{
				selector: 'JSXExpressionContainer > LogicalExpression[operator="&&"]',
				message:
					'Render both branches explicitly with a ternary that returns `null` instead of relying on `&&`.',
			},
		],
	},
} satisfies Entry;
