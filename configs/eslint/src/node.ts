import { CORE as OXLINT_CORE } from '@bastidood/oxlint-config/core';
import { NODE as OXLINT_NODE } from '@bastidood/oxlint-config/node';
import type { Linter } from 'eslint';
import nodePlugin from 'eslint-plugin-n';

import type { Entry } from './compose/index.ts';
import { writeCategoryRules, writeEslintRules } from './convert/index.ts';

const RULES: Linter.RulesRecord = {};
writeCategoryRules(RULES, OXLINT_CORE.config.categories, OXLINT_NODE.config.plugins);
writeEslintRules(RULES, OXLINT_NODE.config.rules);

/** `eslint-plugin-n` rules, generated from the Oxlint `node` entry point. */
export const NODE: Entry = {
	configs: [{ name: '@bastidood/eslint-config/node', plugins: { n: nodePlugin }, rules: RULES }],
};
