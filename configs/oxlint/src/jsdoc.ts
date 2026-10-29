import type { Entry } from './compose/index.ts';

export const JSDOC = {
	config: {
		plugins: ['jsdoc'],
		rules: {
			'jsdoc/check-access': 'off',
			'jsdoc/check-property-names': 'off',
			'jsdoc/check-tag-names': ['error', { typed: true }],
			'jsdoc/empty-tags': 'error',
			'jsdoc/implements-on-classes': 'off',
			'jsdoc/no-blank-blocks': ['error', { enableFixer: true }],
			'jsdoc/no-defaults': 'off',
			'jsdoc/require-param': 'off',
			'jsdoc/require-param-description': 'error',
			'jsdoc/require-param-name': 'error',
			'jsdoc/require-param-type': 'off',
			'jsdoc/require-property': 'off',
			'jsdoc/require-property-description': 'off',
			'jsdoc/require-property-name': 'off',
			'jsdoc/require-property-type': 'off',
			'jsdoc/require-returns': 'off',
			'jsdoc/require-returns-description': 'error',
			'jsdoc/require-returns-type': 'off',
			'jsdoc/require-throws-description': 'error',
			'jsdoc/require-throws-type': 'off',
			'jsdoc/require-yields': 'off',
			'jsdoc/require-yields-description': 'error',
			'jsdoc/require-yields-type': 'off',
		},
	},
} satisfies Entry;
