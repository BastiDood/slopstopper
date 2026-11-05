import { join } from 'node:path';

import type { Rule as OxlintRule } from '@oxlint/plugins';
import { type Rule, RuleTester } from 'eslint';
import * as svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';

// ESLint types these hooks with `any` parameters, so the parameters carry the types that ESLint passes.
RuleTester.describe = (text: string, fn: () => void) => {
	describe(text, fn);
};
RuleTester.it = (text: string, fn: () => void) => {
	it(text, fn);
};

/**
 * Runs rule tests through ESLint with typescript-eslint's parser and project service, so that every case has type
 * information. Each case parses as a virtual `estree.ts` in `fixture/`, whose `tsconfig.json` sets the compiler options. A
 * JSX case sets a `filename` that ends in `.tsx`.
 */
export const TYPED_RULE_TESTER = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: {
			projectService: {
				allowDefaultProject: ['*.ts', '*.tsx'],
				defaultProject: 'tsconfig.json',
			},
			tsconfigRootDir: join(import.meta.dirname, 'fixture'),
		},
	},
});

/** Runs rule tests through ESLint with typescript-eslint's parser but no TypeScript program, so without type information. */
export const UNTYPED_RULE_TESTER = new RuleTester({ languageOptions: { parser: tseslint.parser } });

/**
 * Runs rule tests on Svelte components through ESLint with `svelte-eslint-parser`, which parses `<script lang="ts">` with
 * typescript-eslint's parser, without type information. Each case must set a `filename` that ends in `.svelte`.
 */
export const SVELTE_RULE_TESTER = new RuleTester({
	languageOptions: { parser: svelteParser, parserOptions: { parser: tseslint.parser } },
});

/** A slopstopper rule typed for ESLint's `RuleTester`. */
export function eslintRule(rule: OxlintRule) {
	// The slopstopper rules are typed for Oxlint, whose rule context type is incompatible with ESLint's even though ESLint
	// runs the same rule objects as-is.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Oxlint's and ESLint's rule types do not overlap.
	return rule as unknown as Rule.RuleModule;
}
