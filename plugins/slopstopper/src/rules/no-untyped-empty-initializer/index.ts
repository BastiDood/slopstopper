import { type Context, defineRule, type ESTree } from '@oxlint/plugins';

import { keyName, messageLabel } from '#ast/labels.ts';

/** A literal that gives TypeScript nothing to infer from: an empty array, an empty object, or `null`. */
type EmptyLiteral = ESTree.ArrayExpression | ESTree.ObjectExpression | ESTree.NullLiteral;

/** A node that may carry a type annotation of its own, such as a binding or a class property. */
interface Annotatable {
	typeAnnotation?: ESTree.TSTypeAnnotation | null;
}

/**
 * Reports a variable without a type annotation that has no initializer or starts as an empty literal (`[]`, `{}`, or
 * `null`), a class property without one that starts as an empty literal, a parameter default `[]` or `{}` without one,
 * an empty `new Map()`, `new WeakMap()`, or `new Set()` without type arguments, and a type assertion on an empty
 * literal. TypeScript infers nothing useful from these, so the rule asks for an annotation or type arguments instead.
 */
export const NO_UNTYPED_EMPTY_INITIALIZER = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require an explicit type for bindings that start without a value, as an empty literal, or as an empty collection.',
		},
		messages: {
			uninitialized:
				'`{{name}}` has neither an initializer nor a type annotation, so TypeScript infers its type only from later assignments. Initialize it, or annotate it, as in `let {{name}}: Item;`.',
			emptyArray:
				'`{{name}}` starts as an empty array, so TypeScript cannot infer its element type. Annotate it, as in `{{name}}: Element[] = []`.',
			emptyObject:
				'`{{name}}` starts as an empty object, whose type `{}` accepts every value except `null` and `undefined`. Annotate it with a named interface, or build the object with its properties in one literal.',
			nullValue:
				'`{{name}}` starts as `null`, which says nothing about the values that it holds later. Annotate their type, as in `{{name}}: Item | null = null`.',
			emptyArrayDefault:
				'`{{name}}` defaults to `[]` without an annotation, so TypeScript infers `never[]`. Annotate the parameter, as in `{{name}}: Item[] = []`.',
			emptyObjectDefault:
				'`{{name}}` defaults to `{}` without an annotation, so TypeScript infers `{}`, which accepts every value except `null` and `undefined`. Annotate the parameter with a named interface, as in `{{name}}: Options = {}`.',
			emptyCollection:
				'`new {{name}}()` without type arguments infers `{{inferred}}`. Pass type arguments, as in `new {{name}}<{{parameters}}>()`.',
			emptyAssertion:
				'Do not assert the type of `{{value}}`. Annotate the binding that receives it, or pass type arguments to the generic call that receives it, as in `useState<Item[]>([])`.',
		},
		schema: [],
	},
	create(context) {
		return {
			VariableDeclarator: node => checkUninitialized(context, node),
			ArrayExpression(node) {
				if (node.elements.length === 0) checkEmptyLiteral(context, node);
			},
			ObjectExpression(node) {
				if (node.properties.length === 0) checkEmptyLiteral(context, node);
			},
			Literal(node) {
				if (node.value === null && !('regex' in node)) checkEmptyLiteral(context, node);
			},
			NewExpression: node => checkEmptyCollection(context, node),
		};
	},
});

/**
 * Reports a variable without an initializer or an annotation. The declarators in the head of a `for…in` or `for…of` loop
 * take their values from the loop, and an ambient `declare` declaration has no value.
 */
function checkUninitialized(context: Context, node: ESTree.VariableDeclarator) {
	const { id, init, parent } = node;
	if (
		init !== null ||
		id.type !== 'Identifier' ||
		isAnnotated(id) ||
		parent.type !== 'VariableDeclaration' ||
		parent.declare === true ||
		isLoopHead(parent)
	) {
		return;
	}
	context.report({ node, messageId: 'uninitialized', data: { name: id.name } });
}

function isLoopHead(declaration: ESTree.VariableDeclaration) {
	const { parent } = declaration;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only `for…in` and `for…of` loops assign their head, so `default` covers the rest.
	switch (parent.type) {
		case 'ForInStatement':
		case 'ForOfStatement':
			return parent.left === declaration;
		default:
			return false;
	}
}

/** Reports an empty literal that initializes an unannotated binding, defaults an unannotated parameter, or is asserted. */
function checkEmptyLiteral(context: Context, node: EmptyLiteral) {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only bindings, defaults, and assertions receive the literal, so `default` covers the rest.
	switch (parent.type) {
		case 'VariableDeclarator': {
			const { id } = parent;
			if (id.type !== 'Identifier' || isAnnotated(id)) return;
			context.report({ node, messageId: bindingMessage(node), data: { name: id.name } });
			return;
		}
		case 'PropertyDefinition': {
			const { key, computed, value } = parent;
			if (value !== node || isAnnotated(parent)) return;
			const name = keyName(key, computed) ?? context.sourceCode.getText(key);
			context.report({
				node,
				messageId: bindingMessage(node),
				data: { name: messageLabel(name) },
			});
			return;
		}
		case 'AssignmentPattern': {
			const { left } = parent;
			if (
				node.type === 'Literal' ||
				left.type !== 'Identifier' ||
				isAnnotated(left) ||
				!lacksContextualType(parent)
			) {
				return;
			}
			context.report({
				node,
				messageId:
					node.type === 'ArrayExpression' ? 'emptyArrayDefault' : 'emptyObjectDefault',
				data: { name: left.name },
			});
			return;
		}
		case 'TSAsExpression':
		case 'TSTypeAssertion':
			if (isConstAssertion(parent.typeAnnotation)) return;
			context.report({
				node: parent,
				messageId: 'emptyAssertion',
				data: { value: context.sourceCode.getText(node) },
			});
			break;
		default:
	}
}

/** The message about a binding that starts as an empty literal. */
function bindingMessage({ type }: EmptyLiteral) {
	switch (type) {
		case 'ArrayExpression':
			return 'emptyArray';
		case 'ObjectExpression':
			return 'emptyObject';
		case 'Literal':
			return 'nullValue';
	}
}

/**
 * Whether a default in a parameter gets no contextual type: no pattern around it carries an annotation, and the function
 * gets none (see `isUncontextualFunction`). A default in a declaration or an assignment gets its type from the
 * destructured value.
 */
function lacksContextualType(pattern: ESTree.Node) {
	for (let child: ESTree.Node = pattern; child.parent !== null; child = child.parent) {
		const { parent } = child;
		// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only patterns and parameters lead from a default to its function, so `default` covers the rest.
		switch (parent.type) {
			case 'Property':
			case 'TSParameterProperty':
				break;
			case 'ObjectPattern':
			case 'ArrayPattern':
			case 'AssignmentPattern':
			case 'RestElement':
				if (isAnnotated(parent)) return false;
				break;
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				return isUncontextualFunction(parent);
			default:
				return false;
		}
	}
	return false;
}

/**
 * Whether a function gets no contextual type for its parameters: a function declaration, a class method, or a function
 * that initializes an unannotated binding (see `initializedBinding`). Any other function, such as a callback, may get one
 * from where it appears.
 */
function isUncontextualFunction(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (node.type === 'FunctionDeclaration' || node.parent.type === 'MethodDefinition') return true;
	const binding = initializedBinding(node);
	return binding !== null && !isAnnotated(binding);
}

/**
 * Reports a global `Map`, `WeakMap`, or `Set` constructed without type arguments or constructor arguments, wherever it
 * appears: the type arguments belong on the constructor, and the binding that receives it infers its type from them.
 */
function checkEmptyCollection(context: Context, node: ESTree.NewExpression) {
	const { callee, typeArguments, arguments: args } = node;
	if (
		callee.type !== 'Identifier' ||
		args.length > 0 ||
		(typeArguments !== null && typeof typeArguments !== 'undefined')
	) {
		return;
	}

	const { name } = callee;
	const types = collectionTypes(name);
	if (types === null || !context.sourceCode.isGlobalReference(callee)) return;
	context.report({ node, messageId: 'emptyCollection', data: { name, ...types } });
}

/** What TypeScript infers for an empty collection of a global constructor, and its type parameters for a message. */
function collectionTypes(name: string) {
	switch (name) {
		case 'Map':
			return { inferred: 'Map<any, any>', parameters: 'Key, Value' };
		case 'WeakMap':
			return { inferred: 'WeakMap<WeakKey, any>', parameters: 'Key, Value' };
		case 'Set':
			return { inferred: 'Set<unknown>', parameters: 'Element' };
		default:
			return null;
	}
}

/**
 * The binding that a value initializes: the id of a declarator, a class property, or the left side of a default. Returns
 * `null` for a value in any other position.
 */
function initializedBinding(value: ESTree.Expression) {
	const { parent } = value;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only declarators, class properties, and defaults bind a value, so `default` covers the rest.
	switch (parent.type) {
		case 'VariableDeclarator':
			return parent.id;
		case 'PropertyDefinition':
			return parent.value === value ? parent : null;
		case 'AssignmentPattern':
			return bindingTarget(parent.left);
		default:
			return null;
	}
}

/** The left side of a default as a binding, or `null` for an assignment target that binds no name, such as `a.b`. */
function bindingTarget(left: ESTree.AssignmentPattern['left'] | ESTree.AssignmentTarget) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only identifiers and patterns bind a name, so `default` covers member expressions and assertions.
	switch (left.type) {
		case 'Identifier':
		case 'ObjectPattern':
		case 'ArrayPattern':
		case 'AssignmentPattern':
			return left;
		default:
			return null;
	}
}

/** Whether a node carries a type annotation. Oxlint sets a missing annotation to `null`, and typescript-estree omits it. */
function isAnnotated({ typeAnnotation }: Annotatable) {
	return typeAnnotation !== null && typeof typeAnnotation !== 'undefined';
}

/** Whether the type of an assertion is `const`, as in `[] as const`. */
function isConstAssertion(type: ESTree.TSType) {
	return (
		type.type === 'TSTypeReference' &&
		type.typeName.type === 'Identifier' &&
		type.typeName.name === 'const'
	);
}
