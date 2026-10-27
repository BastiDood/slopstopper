import { CORE as OXLINT_CORE } from '@bastidood/oxlint-config/core';
import type { ESLint, Linter } from 'eslint';
import { importX } from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

import type { Entry } from './compose/index.ts';
import { writeCategoryRules, writeEslintRules, writeExtensionRules } from './convert/index.ts';

const {
	categories: CATEGORIES,
	overrides: OVERRIDES,
	plugins: PLUGINS,
	rules: OXLINT_RULES,
} = OXLINT_CORE.config;

// Typed as an ESLint plugin to read the metadata of its rules.
const TYPESCRIPT_ESLINT: ESLint.Plugin = tseslint.plugin;

const RULES: Linter.RulesRecord = {};
writeCategoryRules(RULES, CATEGORIES, ['eslint']);
writeCategoryRules(RULES, CATEGORIES, PLUGINS);
writeEslintRules(RULES, OXLINT_RULES);
writeExtensionRules(RULES, OXLINT_RULES, TYPESCRIPT_ESLINT.rules);

const OVERRIDE_CONFIGS: Linter.Config[] = [];
for (const { files, rules } of OVERRIDES) {
	const overrideRules: Linter.RulesRecord = {};
	writeEslintRules(overrideRules, rules);
	writeExtensionRules(overrideRules, rules, TYPESCRIPT_ESLINT.rules);
	OVERRIDE_CONFIGS.push({ name: '@bastidood/eslint-config/core', files, rules: overrideRules });
}

const PLUGIN_DEFINITIONS = { '@typescript-eslint': TYPESCRIPT_ESLINT, import: importX };

/**
 * ESLint core, `import`, and type-aware `@typescript-eslint` rules, generated from the Oxlint `core` entry point. The
 * TypeScript project service finds the `tsconfig.json` nearest each file, searching up to the working directory.
 */
export const CORE: Entry = {
	configs: [
		{
			name: '@bastidood/eslint-config/core',
			languageOptions: {
				parser: tseslint.parser,
				parserOptions: { projectService: true },
			},
			plugins: PLUGIN_DEFINITIONS,
			rules: RULES,
		},
		OVERRIDE_CONFIGS,
	],
	restrictions: OXLINT_CORE.restrictions,
};
