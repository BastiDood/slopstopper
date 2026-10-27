import type { Entry } from '#compose/index.ts';

export const REACT = {
	config: {
		plugins: ['react', 'react-perf'],
		rules: {
			'react-perf/jsx-no-jsx-as-prop': 'error',
			'react-perf/jsx-no-new-array-as-prop': 'error',
			'react-perf/jsx-no-new-function-as-prop': 'error',
			'react-perf/jsx-no-new-object-as-prop': 'error',
			'react/exhaustive-deps': 'error',
			'react/react-in-jsx-scope': 'off',
			'react/rules-of-hooks': 'error',
		},
	},
	restrictions: {
		importPaths: [
			{
				name: 'react',
				importNames: ['useEffect'],
				message:
					'Keep side effects in event handlers or the owner of external synchronization instead of `useEffect`.',
			},
			{
				name: 'react',
				importNames: ['default', '*'],
				message:
					'Import React APIs directly by name and React types with `import type` instead of importing React as a default or namespace.',
			},
		],
	},
} satisfies Entry;
