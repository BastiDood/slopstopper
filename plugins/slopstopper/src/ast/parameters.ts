import type { ESTree } from '@oxlint/plugins';

/**
 * Whether a parameter is optional, either through a default value or TypeScript's `?` marker. Oxlint types the
 * `optional` flag of parameter patterns as `false`, but TypeScript's optional parameters set it to `true`.
 */
export function isOptionalParameter(parameter: ESTree.ParamPattern) {
	switch (parameter.type) {
		case 'AssignmentPattern':
			return true;
		case 'Identifier':
		case 'ObjectPattern':
		case 'ArrayPattern': {
			const descriptor = Object.getOwnPropertyDescriptor(parameter, 'optional');
			return descriptor?.value === true;
		}
		case 'TSParameterProperty':
			return isOptionalParameter(parameter.parameter);
		case 'RestElement':
			return false;
	}
}
