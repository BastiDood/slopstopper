import { CORE as OXLINT_CORE } from '@bastidood/oxlint-config/core';
import { JSDOC as OXLINT_JSDOC } from '@bastidood/oxlint-config/jsdoc';
import type { Linter } from 'eslint';
import jsdocPlugin from 'eslint-plugin-jsdoc';

import type { Entry } from './compose/index.ts';
import { writeCategoryRules, writeEslintRules } from './convert/index.ts';

const RULES: Linter.RulesRecord = {};
writeCategoryRules(RULES, OXLINT_CORE.config.categories, OXLINT_JSDOC.config.plugins);
writeEslintRules(RULES, OXLINT_JSDOC.config.rules);

/** `eslint-plugin-jsdoc` rules, generated from the Oxlint `jsdoc` entry point. */
export const JSDOC: Entry = {
	configs: [
		{ name: '@bastidood/eslint-config/jsdoc', plugins: { jsdoc: jsdocPlugin }, rules: RULES },
	],
};
