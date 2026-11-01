import { defineRule } from '@oxlint/plugins';

import { isExtendableIntersection } from '#ast/extendable.ts';

/**
 * Reports an intersection type alias (`type X = A & { b: B }`) whose constituents are all object type literals or
 * extendable type references, which an `interface X extends A { b: B }` declares instead (prefer interface over
 * intersection). References to imported or otherwise external names are assumed extendable because TypeScript
 * itself reports the ones that are not (TS2312). Qualified `import('x').T` types count as references. A reference
 * to a type parameter in scope, or any other kind of constituent (keywords, unions, mapped types, ...), keeps the
 * alias valid.
 */
export const NEEDLESS_TYPE_INTERSECTION = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description: 'Disallow intersection type aliases that an interface can extend instead.',
		},
		messages: {
			needlessIntersection:
				'`{{name}}` intersects object types that an interface can extend. Declare `interface {{name}} extends ...` instead: interfaces report conflicting members instead of collapsing them to `never`, and the checker caches them. Use `Pick`, `Omit`, or a named alias to give `extends` a single object type.',
		},
		schema: [],
	},
	create(context) {
		return {
			TSTypeAliasDeclaration(node) {
				if (isExtendableIntersection(context.sourceCode, node.typeAnnotation)) {
					context.report({
						node,
						messageId: 'needlessIntersection',
						data: { name: node.id.name },
					});
				}
			},
		};
	},
});
