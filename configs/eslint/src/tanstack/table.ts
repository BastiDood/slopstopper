import { TANSTACK_TABLE as OXLINT_TANSTACK_TABLE } from '@bastidood/oxlint-config/tanstack/table';
import type { Linter } from 'eslint';

import type { Entry } from '#compose/index.ts';
import { writeEslintRules } from '#convert/index.ts';

const RULES: Linter.RulesRecord = {};
writeEslintRules(RULES, OXLINT_TANSTACK_TABLE.config.rules);

/** TanStack Table rules for every framework adapter, generated from the Oxlint `tanstack/table` entry point. */
export const TANSTACK_TABLE: Entry = {
	configs: [{ name: '@bastidood/eslint-config/tanstack/table', rules: RULES }],
	restrictions: OXLINT_TANSTACK_TABLE.restrictions,
};
