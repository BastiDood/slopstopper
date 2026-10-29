import { CORE as OXLINT_CORE } from '@bastidood/oxlint-config/core';
import { VITEST as OXLINT_VITEST } from '@bastidood/oxlint-config/vitest';
import vitestPlugin from '@vitest/eslint-plugin';
import type { Linter } from 'eslint';

import type { Entry } from './compose/index.ts';
import { writeCategoryRules, writeEslintRules } from './convert/index.ts';

const RULES: Linter.RulesRecord = {};
writeCategoryRules(RULES, OXLINT_CORE.config.categories, OXLINT_VITEST.config.plugins);
writeEslintRules(RULES, OXLINT_VITEST.config.rules);

/** `@vitest/eslint-plugin` rules, generated from the Oxlint `vitest` entry point. */
export const VITEST: Entry = {
	configs: [
		{
			name: '@bastidood/eslint-config/vitest',
			plugins: { vitest: vitestPlugin },
			rules: RULES,
		},
	],
};
