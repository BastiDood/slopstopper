import { describe, expect, test } from 'vitest';

import { compose } from './index.ts';

const BASE = {
	configs: [{ name: 'base', rules: { eqeqeq: 'error' as const } }],
	restrictions: {
		importPatterns: [{ regex: String.raw`^\.\./`, message: 'no parent imports' }],
		syntax: [{ selector: '[accessibility="private"]', message: 'no private' }],
	},
};

const NOT_FOUND = { found: false as const };
const TYPESCRIPT_RESOLVER = {
	interfaceVersion: 3,
	name: 'typescript',
	resolve: () => NOT_FOUND,
};
const VIRTUAL_RESOLVER = {
	interfaceVersion: 3,
	name: 'virtual',
	resolve: () => NOT_FOUND,
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
					{
						paths: [],
						patterns: [{ regex: String.raw`^\.\./`, message: 'no parent imports' }],
					},
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

	test('combines the import settings lists of every entry into one final configuration', () => {
		const configs = compose(
			{
				importExtensions: ['.ts', '.js'],
				importExternalModuleFolders: ['node_modules'],
				importParsers: { '@typescript-eslint/parser': ['.ts'] },
				importResolvers: [TYPESCRIPT_RESOLVER],
			},
			{ importExtensions: ['.vue'], importParsers: { 'vue-eslint-parser': ['.vue'] } },
			{
				importExtensions: ['.mts'],
				importExternalModuleFolders: ['vendor'],
				importParsers: { '@typescript-eslint/parser': ['.mts'] },
				importResolvers: [VIRTUAL_RESOLVER],
			},
		);
		expect(configs.at(-1)).toEqual({
			name: '@bastidood/eslint-config/import',
			settings: {
				'import-x/extensions': ['.ts', '.js', '.vue', '.mts'],
				'import-x/external-module-folders': ['node_modules', 'vendor'],
				'import-x/parsers': {
					'@typescript-eslint/parser': ['.ts', '.mts'],
					'vue-eslint-parser': ['.vue'],
				},
				'import-x/resolver-next': [TYPESCRIPT_RESOLVER, VIRTUAL_RESOLVER],
			},
		});
	});

	test('writes only the import settings that an entry contributes to', () => {
		const configs = compose({ importResolvers: [VIRTUAL_RESOLVER] });
		expect(configs.at(-1)).toEqual({
			name: '@bastidood/eslint-config/import',
			settings: { 'import-x/resolver-next': [VIRTUAL_RESOLVER] },
		});
	});

	test('omits the import configuration without import settings', () => {
		const last = compose(BASE).at(-1);
		expect(last?.name).toBe('@bastidood/eslint-config/restrictions');
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
