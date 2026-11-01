import { defineRule } from '@oxlint/plugins';

import { functionLabel } from '#ast/labels.ts';

/**
 * Reports every type predicate (`x is T`, `this is T`) and assertion signature (`asserts x`, `asserts x is T`,
 * `asserts this`) in any return type position: functions, declarations, overloads, methods, function types, method
 * signatures, and call signatures. TypeScript does not verify that the body of a type guard proves its predicate, so
 * an annotated predicate can lie. The project relies on inference instead: TypeScript 5.5+ infers type predicates from
 * bodies such as `x => x !== null`, and it never infers `asserts` signatures, so code returns the parsed value instead.
 */
export const NO_TYPE_PREDICATES = defineRule({
	meta: {
		type: 'suggestion',
		docs: { description: 'Disallow type predicate and assertion signature annotations.' },
		messages: {
			typePredicate:
				"TypeScript does not check that this function's body proves `{{subject}} is ...`, so the predicate can lie. Remove the annotation and let TypeScript infer the predicate from the body, or return the narrowed value instead.",
			assertion:
				'TypeScript does not check that {{function}} throws when the assertion on `{{subject}}` fails, and it never infers assertion signatures. Return the parsed value instead of asserting it, so the type flows from what the function actually checks.',
		},
		schema: [],
	},
	create(context) {
		return {
			TSTypePredicate(node) {
				const subject =
					node.parameterName.type === 'TSThisType' ? 'this' : node.parameterName.name;
				if (node.asserts) {
					const owner = node.parent.parent;
					const data = {
						function: owner === null ? 'this function' : functionLabel(owner),
						subject,
					};
					context.report({ node, messageId: 'assertion', data });
					return;
				}

				context.report({ node, messageId: 'typePredicate', data: { subject } });
			},
		};
	},
});
