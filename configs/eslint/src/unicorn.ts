import { CORE as OXLINT_CORE } from '@bastidood/oxlint-config/core';
import { UNICORN as OXLINT_UNICORN } from '@bastidood/oxlint-config/unicorn';
import type { Linter } from 'eslint';
import unicornPlugin from 'eslint-plugin-unicorn';

import type { Entry } from '#compose/index.ts';
import { writeCategoryRules, writeEslintRules } from '#convert/index.ts';

const RULES: Linter.RulesRecord = {};
writeCategoryRules(RULES, OXLINT_CORE.config.categories, OXLINT_UNICORN.config.plugins);
writeEslintRules(RULES, OXLINT_UNICORN.config.rules);

/** `eslint-plugin-unicorn` rules, generated from the Oxlint `unicorn` entry point. */
export const UNICORN: Entry = {
	configs: [
		{ name: '@bastidood/eslint-config/unicorn', plugins: { unicorn: unicornPlugin }, rules: RULES },
	],
};
