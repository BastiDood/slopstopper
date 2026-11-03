import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { isExtendableIntersection } from '#ast/extendable.ts';

/**
 * Reports an object type literal nested anywhere in the type of a type alias: in a union, an intersection, a function
 * type, a generic argument, a tuple, and so on. A literal inside a reported literal is not reported again. An alias
 * whose whole type is one literal is left to `typescript/consistent-type-definitions`, an intersection that
 * `needless-type-intersection` reports is left to that rule, and an empty `{}` has no useful interface to replace it.
 */
export const NO_ALIAS_OBJECT_TYPE = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow object type literals inside type aliases in favor of named interfaces.',
		},
		messages: {
			aliasObjectType:
				'Declare this object shape in `{{alias}}` as a named `interface` and reference it: named interfaces give readable errors and declarations.',
		},
		schema: [],
	},
	create(context) {
		return {
			TSTypeLiteral(node) {
				if (node.members.length === 0) return;

				const alias = enclosingAlias(context.sourceCode, node);
				if (alias !== null) {
					context.report({
						node,
						messageId: 'aliasObjectType',
						data: { alias: alias.id.name },
					});
				}
			},
		};
	},
});

/**
 * The type alias whose type a literal is nested in, or `null` when the literal is the alias's whole type, sits inside
 * another literal, or sits in an intersection that `needless-type-intersection` reports.
 */
function enclosingAlias(sourceCode: SourceCode, literal: ESTree.TSTypeLiteral) {
	for (let child: ESTree.Node = literal; child.parent !== null; child = child.parent) {
		const { parent } = child;
		// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only an enclosing literal or alias ends the walk, so `default` covers the rest.
		switch (parent.type) {
			case 'TSTypeLiteral':
				return null;
			case 'TSTypeAliasDeclaration': {
				const type = parent.typeAnnotation;
				return type !== child ||
					type === literal ||
					isExtendableIntersection(sourceCode, type)
					? null
					: parent;
			}
			default:
		}
	}
	return null;
}
