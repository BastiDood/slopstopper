import { defineRule } from '@oxlint/plugins';

import { unwrap } from '#ast/discriminant.ts';
import { returnedCallback } from '#ast/functions.ts';
import { callbackCall } from '#ast/known-arrays.ts';
import { messageLabel } from '#ast/labels.ts';
import { isEmptyArray } from '#ast/literals.ts';
import { outermostWrapper } from '#ast/members.ts';

/**
 * Reports a `.flatMap` callback that returns `<value> ?? []`, as in `xs.flatMap(x => x?.y ?? [])`, where the empty array
 * fallback hides that a value is missing. The callback's return counts as either an arrow function's expression body
 * or the argument of a `return` statement, seen through TypeScript assertions. An explicit ternary such as
 * `xs.flatMap(x => (cond ? [x.y] : []))` stays unreported. There is no rewrite. The author must choose a `.reduce` that
 * pushes only present values into its one accumulator, a `for…of` loop for a callback with other side effects or several
 * results, or an explicit ternary.
 */
export const NO_FLAT_MAP_NULLISH_FALLBACK = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow a `.flatMap` callback that returns a nullish fallback to `[]` to skip missing values.',
		},
		messages: {
			nullishFallback:
				'`{{fallback}}` returns `[]` from `.flatMap` to hide a missing `{{value}}`. Push the present values into the accumulator of `.reduce<T[]>(…, [])` in an `if` that checks `{{value}}`. Pass the element type as the generic, so that `[]` does not infer `never[]`. Keep that callback to pushing into its one accumulator. Use a `for…of` loop when it has other side effects or builds several results. An explicit ternary that checks `{{value}}` and returns `[]` also works.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		return {
			LogicalExpression(node) {
				const { operator, left, right } = node;
				if (operator !== '??' || !isEmptyArray(unwrap(right))) return;
				const callback = returnedCallback(outermostWrapper(node));
				if (callback === null || callbackCall(callback, 'flatMap') === null) return;
				context.report({
					node,
					messageId: 'nullishFallback',
					data: {
						fallback: messageLabel(sourceCode.getText(node)),
						value: messageLabel(sourceCode.getText(left)),
					},
				});
			},
		};
	},
});
