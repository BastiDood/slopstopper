import {
	type Context,
	defineRule,
	type ESTree,
	type Range,
	type SourceCode,
	type Variable,
} from '@oxlint/plugins';

import { AssertionError, assertDefined } from '#assert.ts';
import { functionLabel, messageLabel } from '#ast/labels.ts';
import { propertyName } from '#ast/property-keys.ts';
import { isWithin } from '#ast/ranges.ts';
import { typeAtLocation, type TypeServices, typeServicesOf } from '#type-services.ts';

interface Frame {
	node: ESTree.Function | ESTree.ArrowFunctionExpression;
	/**
	 * The key that `this.<key>` uses to reach this function as a method, or `null` when it is not a method or has no return
	 * type annotation, which leaves nothing to report.
	 */
	methodKey: string | null;
	returns: number;
	valueReturns: number;
	recursive: boolean;
}

/**
 * Reports an explicit return type annotation on a function with a body, because TypeScript's inference already
 * derives the return type from the body. The rule leaves consistency checks to `tsc`. A return type annotation stays
 * allowed when it carries information that inference cannot:
 *
 * - `never` on a function whose own body has no `return`, so `tsc` verifies that the function cannot complete.
 * - A function with two or more value-returning `return` statements, where the annotation constrains the union.
 * - A recursive function (by its own name, its variable name, or `this.<method>` through any known key, see `keyOf`),
 *   which `tsc` cannot infer.
 * - A type predicate or `asserts` signature, which `no-type-predicates` reports instead.
 *
 * The rule offers a suggestion, not an autofix, because removing the annotation can change the inferred public type.
 */
export const NO_INFERRABLE_RETURN_TYPE = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow explicit return types that TypeScript inference already derives.',
		},
		hasSuggestions: true,
		messages: {
			inferrable:
				'Remove `{{annotation}}` from {{function}} and let TypeScript infer it. Annotate a return type only to declare `never` on a function without `return`, or to constrain a function with several value-returning branches.',
			removeAnnotation: 'Remove the return type annotation.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const services = typeServicesOf(sourceCode);
		const frames: Frame[] = [];

		return {
			FunctionDeclaration: node => enter(frames, services, node),
			FunctionExpression: node => enter(frames, services, node),
			ArrowFunctionExpression: node => enter(frames, services, node),
			'FunctionDeclaration:exit': () => exit(context, frames),
			'FunctionExpression:exit': () => exit(context, frames),
			'ArrowFunctionExpression:exit': () => exit(context, frames),
			ReturnStatement(node) {
				const frame = frames.at(-1);
				if (typeof frame === 'undefined') return;
				++frame.returns;
				if (node.argument !== null) ++frame.valueReturns;
			},
			MemberExpression({ object, property, computed }) {
				if (object.type !== 'ThisExpression' || frames.length === 0) return;
				const key = keyOf(services, property, computed);
				if (key !== null) markRecursiveMethods(frames, key);
			},
		};
	},
});

function enter(
	frames: Frame[],
	services: TypeServices | null,
	node: ESTree.Function | ESTree.ArrowFunctionExpression,
) {
	const implicitReturns = node.body?.type === 'BlockStatement' ? 0 : 1;
	frames.push({
		node,
		methodKey:
			node.returnType === null || typeof node.returnType === 'undefined'
				? null
				: methodKeyOf(services, node),
		returns: implicitReturns,
		valueReturns: implicitReturns,
		recursive: false,
	});
}

/** Closes the innermost frame and reports its return type annotation when inference already derives it. */
function exit(context: Context, frames: Frame[]) {
	const { sourceCode } = context;
	const frame = assertDefined(frames.pop());
	const returnType = inferrableReturnType(sourceCode, frame);
	if (returnType === null) return;

	context.report({
		node: returnType,
		messageId: 'inferrable',
		data: {
			annotation: messageLabel(sourceCode.getText(returnType)),
			function: functionLabel(frame.node),
		},
		suggest: [
			{
				messageId: 'removeAnnotation',
				fix(fixer) {
					const before = sourceCode.getTokenBefore(returnType);
					if (before === null) {
						throw new AssertionError('a parameter list precedes the return type');
					}
					return fixer.removeRange([before.range[1], returnType.range[1]]);
				},
			},
		],
	});
}

/** The key under which a function is reachable as `this.<key>`, when it is a class or object member. */
function methodKeyOf(
	services: TypeServices | null,
	node: ESTree.Function | ESTree.ArrowFunctionExpression,
) {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (parent.type) {
		case 'MethodDefinition':
		case 'Property':
		case 'PropertyDefinition':
			// A function that is the computed key instead of the value has no key of its own, so `keyOf` returns `null`.
			return keyOf(services, parent.key, parent.computed);
		default:
			return null;
	}
}

/**
 * The known name of a property key: its static key or, with type information, the value of a computed key whose type
 * is one string or number literal. Returns `null` for any other dynamic key.
 */
function keyOf(services: TypeServices | null, key: ESTree.PropertyKey, computed: boolean) {
	const staticKey = staticKeyOf(key, computed);
	if (staticKey === null && computed && services !== null) {
		const type = typeAtLocation(services, key);
		const value = type?.value;
		return typeof value === 'string' || typeof value === 'number' ? `.${value}` : null;
	}
	return staticKey;
}

/**
 * The statically known name of a property key, or `null` for a dynamic key. Names, string literals, and number literals
 * map to the same `.`-prefixed key whether computed or not (`m`, `'m'`, `['m']`, and `1`, `'1'`, `[1]`), and private
 * names map to a `#`-prefixed key.
 */
function staticKeyOf(key: ESTree.PropertyKey, computed: boolean) {
	if (key.type === 'PrivateIdentifier') return `#${key.name}`;
	const name = propertyName(key, computed);
	return name === null ? null : `.${name}`;
}

/**
 * Marks every open method frame under `key` as recursive, walking outward from the innermost frame through arrow
 * functions only, because any other function rebinds `this`.
 */
function markRecursiveMethods(frames: readonly Frame[], key: string) {
	for (let index = frames.length - 1; index >= 0; --index) {
		const frame = assertDefined(frames[index]);
		if (frame.methodKey === key) frame.recursive = true;
		if (frame.node.type !== 'ArrowFunctionExpression') return;
	}
}

/** The return type annotation of the frame's function when inference already derives it, otherwise `null`. */
function inferrableReturnType(sourceCode: SourceCode, frame: Frame) {
	const { node } = frame;
	const { returnType, body } = node;
	if (body === null || returnType === null || typeof returnType === 'undefined') return null;

	const annotation = returnType.typeAnnotation;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several dozen type node types matter, so `default` covers the rest.
	switch (annotation.type) {
		case 'TSTypePredicate':
			return null;
		case 'TSNeverKeyword':
			if (frame.returns === 0) return null;
			break;
		default:
			break;
	}
	if (frame.valueReturns > 1 || frame.recursive) return null;
	return isSelfReferencing(sourceCode, node, body) ? null : returnType;
}

/** Whether the body references the function through its own name or the variable it initializes. */
function isSelfReferencing(
	sourceCode: SourceCode,
	node: ESTree.Function | ESTree.ArrowFunctionExpression,
	{ range }: ESTree.Node,
) {
	if (node.id !== null && isReferencedWithin(bindingOf(sourceCode, node, node.id), range)) {
		return true;
	}

	const { parent } = node;
	return (
		parent.type === 'VariableDeclarator' &&
		parent.init === node &&
		parent.id.type === 'Identifier' &&
		isReferencedWithin(bindingOf(sourceCode, parent, parent.id), range)
	);
}

/** The variable that `declarator` binds through `id`. */
function bindingOf(sourceCode: SourceCode, declarator: ESTree.Node, id: ESTree.BindingIdentifier) {
	return sourceCode
		.getDeclaredVariables(declarator)
		.find(({ identifiers }) => identifiers.includes(id));
}

function isReferencedWithin(variable: Variable | undefined, range: Range) {
	return (
		variable?.references.some(({ identifier }) => isWithin(identifier.range, range)) === true
	);
}
