import { describe, expect, test } from 'vitest';

import { compose } from './index.ts';

const PARENT_IMPORTS = {
	config: { plugins: ['typescript' as const], rules: { eqeqeq: 'error' as const } },
	restrictions: {
		importPatterns: [{ regex: String.raw`^\.\./`, message: 'no parent imports' }],
		globals: [{ name: 'undefined', message: 'no undefined' }],
		properties: [{ object: 'process', property: 'env', message: 'no env' }],
		syntax: [{ selector: '[accessibility="private"]', message: 'no private' }],
	},
};

const REACT = {
	config: {
		plugins: ['typescript' as const, 'react' as const],
		jsPlugins: [{ name: 'eslint-js', specifier: 'oxlint-plugin-eslint' }],
		rules: { eqeqeq: 'off' as const, 'react/jsx-key': 'error' as const },
	},
	restrictions: {
		importPaths: [{ name: 'react', importNames: ['useEffect'], message: 'no useEffect' }],
		globals: [{ name: 'event', message: 'no event' }],
		properties: [{ object: 'Math', property: 'random', message: 'no random' }],
		syntax: [{ selector: 'DebuggerStatement', message: 'no debugger' }],
	},
	scopedRestrictions: [
		{
			files: ['**/*.tsx'],
			restrictions: { importPaths: [{ name: 'react-dom', message: 'no react-dom' }] },
		},
	],
};

describe('compose', () => {
	const config = compose(PARENT_IMPORTS, REACT);

	test('concatenates every restriction list across entries', () => {
		expect(config.rules['no-restricted-imports']).toEqual([
			'error',
			{
				paths: [{ name: 'react', importNames: ['useEffect'], message: 'no useEffect' }],
				patterns: [{ regex: String.raw`^\.\./`, message: 'no parent imports' }],
			},
		]);
		expect(config.rules['no-restricted-globals']).toEqual([
			'error',
			{ name: 'undefined', message: 'no undefined' },
			{ name: 'event', message: 'no event' },
		]);
		expect(config.rules['no-restricted-properties']).toEqual([
			'error',
			{ object: 'process', property: 'env', message: 'no env' },
			{ object: 'Math', property: 'random', message: 'no random' },
		]);
		expect(config.rules['eslint-js/no-restricted-syntax']).toEqual([
			'error',
			{ selector: '[accessibility="private"]', message: 'no private' },
			{ selector: 'DebuggerStatement', message: 'no debugger' },
		]);
	});

	test('repeats the top-level restrictions in each scoped override', () => {
		expect(config.overrides).toEqual([
			{
				files: ['**/*.tsx'],
				rules: {
					'no-restricted-imports': [
						'error',
						{
							paths: [
								{
									name: 'react',
									importNames: ['useEffect'],
									message: 'no useEffect',
								},
								{ name: 'react-dom', message: 'no react-dom' },
							],
							patterns: [{ regex: String.raw`^\.\./`, message: 'no parent imports' }],
						},
					],
					'no-restricted-globals': config.rules['no-restricted-globals'],
					'no-restricted-properties': config.rules['no-restricted-properties'],
					'eslint-js/no-restricted-syntax':
						config.rules['eslint-js/no-restricted-syntax'],
				},
			},
		]);
	});

	test('merges plugins and JS plugins by name', () => {
		expect(config.plugins).toEqual(['typescript', 'react']);
		expect(config.jsPlugins).toEqual([
			{ name: 'eslint-js', specifier: 'oxlint-plugin-eslint' },
		]);
	});

	test('registers the eslint-js plugin only when a syntax restriction exists', () => {
		const withoutSyntax = compose({ config: { rules: { eqeqeq: 'error' } } });
		expect(withoutSyntax.jsPlugins).toEqual([]);
		expect(withoutSyntax.rules).toEqual({ eqeqeq: 'error' });

		const withSyntax = compose({ config: {}, restrictions: PARENT_IMPORTS.restrictions });
		expect(withSyntax.jsPlugins).toEqual([
			{ name: 'eslint-js', specifier: 'oxlint-plugin-eslint' },
		]);
	});
});
