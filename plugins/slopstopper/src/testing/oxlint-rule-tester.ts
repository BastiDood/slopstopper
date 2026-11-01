import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

RuleTester.describe = (text, fn) => {
	describe(text, fn);
};
RuleTester.it = (text, fn) => {
	it(text, fn);
};

/** Runs rule tests through Oxlint's own linter, parsing every case as TypeScript. */
export const OXLINT_RULE_TESTER = new RuleTester({
	languageOptions: { env: { builtin: true }, parserOptions: { lang: 'ts' } },
});
