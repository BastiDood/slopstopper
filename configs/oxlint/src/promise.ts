import type { Entry } from './compose/index.ts';

export const PROMISE = {
	config: {
		plugins: ['promise'],
		rules: {
			'promise/param-names': 'error',
			'promise/prefer-await-to-callbacks': 'error',
			'promise/prefer-await-to-then': ['error', { strict: true }],
		},
	},
} satisfies Entry;
