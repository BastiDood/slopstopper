import type { Linter, Rule } from 'eslint';
import { describe, expect, test } from 'vitest';

import {
	toEslintRuleName,
	writeCategoryRules,
	writeEslintRules,
	writeExtensionRules,
} from './index.ts';

describe('toEslintRuleName', () => {
	test('renames Oxlint plugin scopes to their ESLint namespaces', () => {
		expect(toEslintRuleName('typescript/no-explicit-any')).toBe(
			'@typescript-eslint/no-explicit-any',
		);
		expect(toEslintRuleName('node/no-process-exit')).toBe('n/no-process-exit');
		expect(toEslintRuleName('eslint-js/no-restricted-syntax')).toBe('no-restricted-syntax');
		expect(toEslintRuleName('react/rules-of-hooks')).toBe('react-hooks/rules-of-hooks');
	});

	test('keeps names that ESLint shares with Oxlint', () => {
		expect(toEslintRuleName('eqeqeq')).toBe('eqeqeq');
		expect(toEslintRuleName('react/jsx-key')).toBe('react/jsx-key');
		expect(toEslintRuleName('unicorn/prefer-at')).toBe('unicorn/prefer-at');
	});
});

describe('writeEslintRules', () => {
	test('skips rules that ESLint cannot run', () => {
		const rules: Linter.RulesRecord = {};
		writeEslintRules(rules, {
			'node/no-exports-assign': 'error',
			'oxc/no-accumulating-spread': 'error',
			'unicorn/no-array-for-each': 'error',
			eqeqeq: 'error',
		});
		expect(rules).toEqual({ eqeqeq: 'error' });
	});

	test('translates severities and keeps rule options', () => {
		const rules: Linter.RulesRecord = {};
		writeEslintRules(rules, {
			'no-console': 'deny',
			'no-debugger': 'allow',
			'typescript/no-floating-promises': ['error', { ignoreVoid: false }],
		});
		expect(rules).toEqual({
			'no-console': 'error',
			'no-debugger': 'off',
			'@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
		});
	});
});

describe('writeCategoryRules', () => {
	test('expands a category only for the namespaces of the given plugins', () => {
		const rules: Linter.RulesRecord = {};
		writeCategoryRules(rules, { correctness: 'error' }, ['unicorn']);
		expect(rules['unicorn/no-thenable']).toBe('error');
		expect(Object.keys(rules).every(name => name.startsWith('unicorn/'))).toBe(true);
	});

	test('includes ESLint core rules only for the eslint plugin', () => {
		const core: Linter.RulesRecord = {};
		writeCategoryRules(core, { correctness: 'error' }, ['eslint']);
		expect(core['no-debugger']).toBe('error');

		const unicorn: Linter.RulesRecord = {};
		writeCategoryRules(unicorn, { correctness: 'error' }, ['unicorn']);
		expect(unicorn['no-debugger']).toBeUndefined();
	});

	test('skips categories that are not configured', () => {
		const rules: Linter.RulesRecord = {};
		writeCategoryRules(rules, {}, ['eslint']);
		expect(rules).toEqual({});
	});
});

describe('writeExtensionRules', () => {
	const RULE: Rule.RuleModule = { create: () => ({}) };
	const DEPRECATED: Rule.RuleModule = { meta: { deprecated: true }, create: () => ({}) };
	const EXTENSIONS = { 'init-declarations': RULE, 'no-loop-func': DEPRECATED, 'no-shadow': RULE };

	test('moves a core rule and its options to the extension of the same name', () => {
		const rules: Linter.RulesRecord = { 'no-shadow': ['error', { hoist: 'all' }] };
		writeExtensionRules(rules, {}, EXTENSIONS);
		expect(rules).toEqual({
			'no-shadow': 'off',
			'@typescript-eslint/no-shadow': ['error', { hoist: 'all' }],
		});
	});

	test('mirrors a disabled core rule onto its extension', () => {
		const rules: Linter.RulesRecord = {
			'no-shadow': 'off',
			'@typescript-eslint/no-shadow': 'error',
		};
		writeExtensionRules(rules, {}, EXTENSIONS);
		expect(rules).toEqual({ 'no-shadow': 'off', '@typescript-eslint/no-shadow': 'off' });
	});

	test('keeps an extension that Oxlint configures explicitly', () => {
		const rules: Linter.RulesRecord = {
			'init-declarations': 'off',
			'@typescript-eslint/init-declarations': 'error',
		};
		writeExtensionRules(rules, { 'typescript/init-declarations': 'error' }, EXTENSIONS);
		expect(rules).toEqual({
			'init-declarations': 'off',
			'@typescript-eslint/init-declarations': 'error',
		});
	});

	test('keeps the core rule in charge of a deprecated extension', () => {
		const rules: Linter.RulesRecord = {
			'no-loop-func': 'error',
			'@typescript-eslint/no-loop-func': 'error',
		};
		writeExtensionRules(rules, {}, EXTENSIONS);
		expect(rules).toEqual({ 'no-loop-func': 'error', '@typescript-eslint/no-loop-func': 'off' });
	});
});
