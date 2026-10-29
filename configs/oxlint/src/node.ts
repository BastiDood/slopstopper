import type { Entry } from './compose/index.ts';

/** Node.js rules for code that runs on Node.js. */
export const NODE = {
	config: {
		plugins: ['node'],
		rules: {
			'node/callback-return': 'off',
			'node/handle-callback-err': 'error',
			'node/no-exports-assign': 'error',
			'node/no-path-concat': 'error',
			'node/no-sync': 'error',
		},
	},
} satisfies Entry;
