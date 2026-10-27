import { describe, expect, test } from 'vitest';

import { compose } from '#compose/index.ts';

const BASE = {
	configs: [{ name: 'base', rules: { eqeqeq: 'error' as const } }],
	restrictions: {
		importPatterns: [{ regex: String.raw`^\.\./`, message: 'no parent imports' }],
		syntax: [{ selector: '[accessibility="private"]', message: 'no private' }],
	},
};

const SVELTE = {
	scopedRestrictions: [
		{
			files: ['**/*.svelte'],
			restrictions: { globals: [{ name: '$effect', message: 'no $effect' }] },
		},
	],
};

describe('compose', () => {
	const [baseConfig, restrictions, scoped] = compose(BASE, SVELTE);

	test('keeps entry configurations in order', () => {
		expect(baseConfig).toEqual({ name: 'base', rules: { eqeqeq: 'error' } });
	});

	test('flattens nested configuration lists one level', () => {
		const [first, second, third] = compose({
			configs: [[{ name: 'first' }, { name: 'second' }], { name: 'third' }],
		});
		expect([first, second, third]).toEqual([
			{ name: 'first' },
			{ name: 'second' },
			{ name: 'third' },
		]);
	});

	test('emits the restrictions under ESLint rule names without imposing files', () => {
		expect(restrictions).toEqual({
			name: '@bastidood/eslint-config/restrictions',
			rules: {
				'no-restricted-imports': [
					'error',
					{ paths: [], patterns: [{ regex: String.raw`^\.\./`, message: 'no parent imports' }] },
				],
				'no-restricted-syntax': [
					'error',
					{ selector: '[accessibility="private"]', message: 'no private' },
				],
			},
		});
	});

	test('combines the extra file extensions of every entry into one final configuration', () => {
		const configs = compose(
			{ extraFileExtensions: ['.svelte'] },
			{ configs: [{ name: 'astro' }], extraFileExtensions: ['.astro'] },
		);
		expect(configs.at(-1)).toEqual({
			name: '@bastidood/eslint-config/project-service',
			languageOptions: { parserOptions: { extraFileExtensions: ['.svelte', '.astro'] } },
		});
	});

	test('repeats the top-level restrictions in each scoped configuration', () => {
		expect(scoped).toEqual({
			name: '@bastidood/eslint-config/scoped-restrictions',
			files: ['**/*.svelte'],
			rules: {
				...restrictions?.rules,
				'no-restricted-globals': ['error', { name: '$effect', message: 'no $effect' }],
			},
		});
	});
});
