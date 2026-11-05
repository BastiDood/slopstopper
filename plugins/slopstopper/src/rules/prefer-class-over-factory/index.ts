import { type Context, defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { unwrap } from '#ast/discriminant.ts';
import { listLabel, messageLabel } from '#ast/labels.ts';

/**
 * A module-level function under visit: the function, the node that names it, and whether every `return` with a value
 * so far returns an object literal with a function-valued member (`null` before the first one).
 */
interface Candidate {
	node: ESTree.Function | ESTree.ArrowFunctionExpression;
	name: ESTree.Node;
	returnsClosures: boolean | null;
}

/** The walk over a file: how deeply functions nest at the current node, and the candidate of the outermost one. */
interface Walk {
	depth: number;
	candidate: Candidate | null;
}

/**
 * Reports a module-level factory: a function declaration, or a `const` initialized with a function or arrow function,
 * at the top level of the module or in an `export`, whose every value `return` (or arrow expression body) is an object
 * literal with at least one function-valued member. Nested functions, callbacks, and methods are not checked, so
 * framework hooks such as a rule's `create(context)` stay allowed.
 */
export const PREFER_CLASS_OVER_FACTORY = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Prefer a class over a module-level factory function that returns an object of closures.',
		},
		messages: {
			preferClass:
				'Turn {{factory}} into {{class}} whose constructor takes {{parameters}}, so the shape and its state have a name. Do not spread an instance to add members; a spread drops its methods and accessors. Declare a field in the class, `extends` it for a variant, or `implements` an interface for a structural contract. If the consumer genuinely necessitates own enumerable properties (which should rarely be the case), keep the factory and suppress this diagnostic.',
		},
		schema: [],
	},
	create(context) {
		const walk: Walk = { depth: 0, candidate: null };

		return {
			FunctionDeclaration: node => enter(walk, node),
			FunctionExpression: node => enter(walk, node),
			ArrowFunctionExpression: node => enter(walk, node),
			'FunctionDeclaration:exit': () => exit(context, walk),
			'FunctionExpression:exit': () => exit(context, walk),
			'ArrowFunctionExpression:exit': () => exit(context, walk),
			ReturnStatement(node) {
				const { candidate } = walk;
				if (walk.depth !== 1 || candidate === null || node.argument === null) return;
				candidate.returnsClosures =
					(candidate.returnsClosures ?? true) && isClosureObject(node.argument);
			},
		};
	},
});

/** Enters a function, and makes the candidate of an outermost one. */
function enter(walk: Walk, node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	++walk.depth;
	if (walk.depth === 1) walk.candidate = candidateOf(node);
}

/** Leaves a function, and reports the candidate of an outermost one whose every value `return` returns closures. */
function exit(context: Context, walk: Walk) {
	--walk.depth;
	const { candidate } = walk;
	if (walk.depth === 0 && candidate?.returnsClosures === true) {
		context.report({
			node: candidate.name,
			messageId: 'preferClass',
			data: factoryData(context.sourceCode, candidate),
		});
	}
}

/** The candidate for an outermost function, or `null` when the function is not module-level. */
function candidateOf(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	const name = moduleLevelName(node);
	if (name === null) return null;

	const returnsClosures =
		node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement'
			? isClosureObject(node.body)
			: null;
	return { node, name, returnsClosures };
}

/**
 * The factory, its class, and its parameters for the message. An anonymous factory is `this factory`, and its class
 * goes unnamed; a named one suggests its name in PascalCase.
 */
function factoryData(sourceCode: SourceCode, { node, name }: Candidate) {
	const parameters = listLabel(
		node.params.map(parameter => `\`${parameterLabel(sourceCode, parameter)}\``),
		'no parameters',
	);
	if (name.type !== 'Identifier') {
		return { factory: 'this factory', class: 'a class', parameters };
	}

	const className = `${name.name.charAt(0).toUpperCase()}${name.name.slice(1)}`;
	return { factory: `\`${name.name}\``, class: `a class \`${className}\``, parameters };
}

/** A parameter for the message: its name, or the text of its pattern without a type annotation, cut when long. */
function parameterLabel(
	sourceCode: SourceCode,
	parameter: ESTree.ParamPattern | ESTree.BindingPattern,
): string {
	switch (parameter.type) {
		case 'Identifier':
			return parameter.name;
		case 'AssignmentPattern':
			return parameterLabel(sourceCode, parameter.left);
		case 'RestElement':
			return `...${parameterLabel(sourceCode, parameter.argument)}`;
		case 'TSParameterProperty':
			return parameterLabel(sourceCode, parameter.parameter);
		case 'ObjectPattern':
		case 'ArrayPattern': {
			const end = parameter.typeAnnotation?.range[0] ?? parameter.range[1];
			return messageLabel(sourceCode.text.slice(parameter.range[0], end).trim());
		}
	}
}

/**
 * The node that names a module-level function: the identifier of a function declaration or `const`, or the function
 * of an anonymous `export default function`. `null` for any other function.
 */
function moduleLevelName(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.type === 'FunctionDeclaration') {
		return isModuleStatement(node) ? (node.id ?? node) : null;
	}

	const { parent } = node;
	if (parent.type !== 'VariableDeclarator' || parent.init !== node) return null;

	const declaration = parent.parent;
	const isConst = declaration.type === 'VariableDeclaration' && declaration.kind === 'const';
	return isConst && isModuleStatement(declaration) ? parent.id : null;
}

/** Whether a statement sits at the top level of the module, directly or in an `export` or `export default`. */
function isModuleStatement(node: ESTree.Function | ESTree.VariableDeclaration) {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the module and its two export wrappers matter, so `default` covers the rest.
	switch (parent.type) {
		case 'Program':
			return true;
		case 'ExportNamedDeclaration':
		case 'ExportDefaultDeclaration':
			return parent.parent.type === 'Program';
		default:
			return false;
	}
}

/** Whether an expression is an object literal with a method, accessor, or function-valued property. */
function isClosureObject(expression: ESTree.Expression) {
	const object = unwrap(expression);
	return (
		object.type === 'ObjectExpression' &&
		object.properties.some(
			property => property.type === 'Property' && isFunction(property.value),
		)
	);
}

/** Whether an expression is a function or arrow function. */
function isFunction(expression: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two function expression kinds matter, so `default` covers the rest.
	switch (expression.type) {
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			return true;
		default:
			return false;
	}
}
