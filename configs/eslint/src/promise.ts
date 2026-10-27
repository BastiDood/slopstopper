import { CORE as OXLINT_CORE } from '@bastidood/oxlint-config/core';
import { PROMISE as OXLINT_PROMISE } from '@bastidood/oxlint-config/promise';
import type { Linter } from 'eslint';
import promisePlugin from 'eslint-plugin-promise';

import type { Entry } from '#compose/index.ts';
import { writeCategoryRules, writeEslintRules } from '#convert/index.ts';

const RULES: Linter.RulesRecord = {};
writeCategoryRules(RULES, OXLINT_CORE.config.categories, OXLINT_PROMISE.config.plugins);
writeEslintRules(RULES, OXLINT_PROMISE.config.rules);

/** `eslint-plugin-promise` rules, generated from the Oxlint `promise` entry point. */
export const PROMISE: Entry = {
	configs: [
		{ name: '@bastidood/eslint-config/promise', plugins: { promise: promisePlugin }, rules: RULES },
	],
};
