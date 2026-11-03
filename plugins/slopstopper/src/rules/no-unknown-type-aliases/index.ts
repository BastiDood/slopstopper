import { defineRule, type SourceCode } from '@oxlint/plugins';

import { fullyExpanded, type ResolvedType, within, written } from '#ast/type-aliases.ts';

/**
 * Reports a type alias whose type resolves to `unknown`: `unknown` itself, a union that holds it, or a reference to a
 * same-file alias or generic alias instance that resolves to it. The name hides that the value is still unchecked.
 */
export const NO_UNKNOWN_TYPE_ALIASES = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow type aliases that resolve to `unknown`.',
		},
		messages: {
			unknownAlias:
				'`{{alias}}` resolves to `unknown` and hides it behind a name. Replace each use of `{{alias}}` with `unknown` where the value is still unchecked, or with the checked type, then delete the alias.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		return {
			TSTypeAliasDeclaration({ id, typeAnnotation }) {
				if (!resolvesToUnknown(sourceCode, written(typeAnnotation))) return;
				context.report({ node: id, messageId: 'unknownAlias', data: { alias: id.name } });
			},
		};
	},
});

/** Whether a type is `unknown`, or a union that holds `unknown`, after expanding aliases and type parameters. */
function resolvesToUnknown(sourceCode: SourceCode, aliased: ResolvedType): boolean {
	const resolved = fullyExpanded(sourceCode, aliased);
	const { type } = resolved;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only `unknown` and unions can resolve to `unknown`, so `default` covers the rest.
	switch (type.type) {
		case 'TSUnknownKeyword':
			return true;
		case 'TSUnionType':
			return type.types.some(member =>
				resolvesToUnknown(sourceCode, within(resolved, member)),
			);
		default:
			return false;
	}
}
