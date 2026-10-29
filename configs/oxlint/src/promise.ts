import type { Entry } from './compose/index.ts';

export const PROMISE = {
	config: {
		plugins: ['promise'],
		rules: {
			'promise/always-return': 'off',
			'promise/avoid-new': 'error',
			'promise/no-callback-in-promise': 'off',
			'promise/no-multiple-resolved': 'error',
			'promise/no-new-statics': 'off',
			'promise/no-promise-in-callback': 'error',
			'promise/param-names': 'error',
			'promise/prefer-await-to-callbacks': 'error',
			'promise/prefer-await-to-then': ['error', { strict: true }],
			'promise/spec-only': 'error',
			'promise/valid-params': 'off',
		},
	},
} satisfies Entry;
