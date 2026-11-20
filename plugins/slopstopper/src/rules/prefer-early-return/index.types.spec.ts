import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { PREFER_EARLY_RETURN } from './index.ts';

const DECLARATIONS =
	'declare function fail(): never; declare function run(): void; declare function read(): Promise<never>;';

TYPED_RULE_TESTER.run('prefer-early-return', eslintRule(PREFER_EARLY_RETURN), {
	valid: [
		// A call that returns `void` does not exit.
		lines(
			DECLARATIONS,
			'function f(x: boolean) {',
			'\tif (x) {',
			'\t\trun();',
			'\t\trun();',
			'\t\treturn 1;',
			'\t}',
			'\trun();',
			'}',
		),
	],
	invalid: [
		// With type information, a call that returns `never` exits. A guard that ends in one gets no fix. TypeScript narrows
		// after the call only when the function has an explicit type annotation.
		{
			code: lines(
				DECLARATIONS,
				'function f(x: boolean) {',
				'\tif (x) {',
				'\t\trun();',
				'\t\trun();',
				'\t\treturn 1;',
				'\t}',
				'\tfail();',
				'}',
			),
			output: null,
			errors: [shorter('x', 3, 1)],
		},
		// So does an awaited call of a promise that never resolves, at the end of the branch.
		{
			code: lines(
				DECLARATIONS,
				'async function f(x: boolean) {',
				'\tif (x) {',
				'\t\trun();',
				'\t\trun();',
				'\t\tawait read();',
				'\t}',
				'\treturn 0;',
				'}',
			),
			output: lines(
				DECLARATIONS,
				'async function f(x: boolean) {',
				'\tif (!x) return 0;',
				'\trun();',
				'\trun();',
				'\tawait read();',
				'}',
			),
			errors: [shorter('x', 3, 1)],
		},
	],
});

function lines(...parts: string[]) {
	return parts.join('\n');
}

function shorter(test: string, branchLines: number, tailLines: number) {
	return {
		messageId: 'shorterBranchFirst',
		data: { test, branchLines: String(branchLines), tailLines: String(tailLines) },
	};
}
