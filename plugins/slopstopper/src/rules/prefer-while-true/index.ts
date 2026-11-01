import { defineRule, type Range } from '@oxlint/plugins';

import { AssertionError } from '#assert.ts';
import { dropsComment } from '#ast/ranges.ts';

/**
 * Reports a `for (;;)` loop, which has no init, test, or update, in favor of `while (true)`, which states the infinite
 * loop in words. The two loops behave the same, so the rule autofixes the head and keeps the body and any label.
 */
export const PREFER_WHILE_TRUE = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description: 'Prefer `while (true)` over `for (;;)`.',
		},
		messages: {
			preferWhileTrue: 'Use `while (true)` instead of `for (;;)`.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;

		return {
			ForStatement(node) {
				if (node.init !== null || node.test !== null || node.update !== null) return;
				context.report({
					node,
					messageId: 'preferWhileTrue',
					fix(fixer) {
						const closing = sourceCode.getTokenBefore(node.body);
						if (closing === null) {
							throw new AssertionError(
								'a closing parenthesis precedes the loop body',
							);
						}

						const range = [node.range[0], closing.range[1]] satisfies Range;
						if (dropsComment(sourceCode, { range, kept: [] })) return null;
						return fixer.replaceTextRange(range, 'while (true)');
					},
				});
			},
		};
	},
});
