import type { Entry } from './compose/index.ts';

/**
 * Turns off the memoization rules that the React Compiler makes obsolete: it memoizes inline functions, objects,
 * arrays, JSX, and context values on its own. Compose after `REACT` so that these settings win.
 */
export const REACT_COMPILER = {
	config: {
		rules: {
			'react-perf/jsx-no-jsx-as-prop': 'off',
			'react-perf/jsx-no-new-array-as-prop': 'off',
			'react-perf/jsx-no-new-function-as-prop': 'off',
			'react-perf/jsx-no-new-object-as-prop': 'off',
			'react/jsx-no-constructed-context-values': 'off',
		},
	},
} satisfies Entry;
