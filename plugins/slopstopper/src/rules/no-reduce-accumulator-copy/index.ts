import { defineRule, type ESTree, type SourceCode, type Variable } from '@oxlint/plugins';

import { AssertionError } from '#assert.ts';
import { firstConstInitializer, isNeverReassigned, unvisitedVariable } from '#ast/bindings.ts';
import { unwrap } from '#ast/discriminant.ts';
import { enclosingFunction } from '#ast/functions.ts';
import {
	isKnownArrayExpression,
	isStandardArrayMethod,
	type MethodTarget,
	methodTarget,
} from '#ast/known-arrays.ts';
import { messageLabel } from '#ast/labels.ts';
import { outermostWrapper } from '#ast/members.ts';
import { type TypeServices, typeServicesOf } from '#type-services.ts';

/** The `.reduce` or `.reduceRight` call whose callback encloses a node, with the accumulator of the callback. */
interface Reducer {
	method: string;
	accumulator: Variable;
	initialValue: ESTree.Argument | null;
}

/**
 * Reports a copy of the accumulator inside the callback of `.reduce` or `.reduceRight`, which copies a growing value on
 * every step and makes the reduction quadratic. Copies are `Object.assign({}, ..., acc, ...)`, `Array.from(acc)`, and
 * `acc.concat`, `slice`, `toSpliced`, `toSorted`, `toReversed`, or `with` on an array accumulator: the initial value is
 * a known array (see `isKnownArrayExpression`), or the type checker resolves the method to the standard one of `Array`
 * or `ReadonlyArray`. The accumulator also matches through never-reassigned `const` aliases. Spreads are left to
 * `oxc/no-accumulating-spread`. There is no rewrite: mutating the accumulator in place changes behavior when the initial
 * value is shared.
 */
export const NO_REDUCE_ACCUMULATOR_COPY = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow copying the reducer accumulator with `Object.assign`, `Array.from`, or array copy methods.',
		},
		messages: {
			objectCopy:
				'`{{call}}` copies the accumulator `{{accumulator}}` on every `.{{reducer}}` step. Assign the new properties onto `{{accumulator}}` itself and return it, starting from a fresh initial object.',
			arrayMethodCopy:
				'`{{call}}` copies the accumulator `{{accumulator}}` on every `.{{reducer}}` step. Call `{{accumulator}}.{{mutator}}(…)` instead and return `{{accumulator}}`, starting from a fresh initial array.',
			withCopy:
				'`{{call}}` copies the accumulator `{{accumulator}}` on every `.{{reducer}}` step. Assign `{{accumulator}}[index] = value` instead and return `{{accumulator}}`, starting from a fresh initial array.',
			arrayCopy:
				'`{{call}}` copies the accumulator `{{accumulator}}` on every `.{{reducer}}` step. Mutate `{{accumulator}}` instead of a copy and return it, starting from a fresh initial array.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const services = typeServicesOf(sourceCode);
		return {
			CallExpression(node) {
				const method = methodTarget(node.callee);
				if (method === null) return;
				const copy = copyMessage(method.name);
				if (copy === null) return;
				const reducer = enclosingReducer(sourceCode, node);
				if (
					reducer === null ||
					!copiesAccumulator(sourceCode, services, reducer, method, node.arguments)
				) {
					return;
				}
				context.report({
					node,
					messageId: copy.messageId,
					data: {
						call: messageLabel(sourceCode.getText(node)),
						accumulator: reducer.accumulator.name,
						reducer: reducer.method,
						...copy.data,
					},
				});
			},
		};
	},
});

/**
 * The message for a call of a copy method, with the method that mutates in place for an array method, or `null` for a
 * method that copies nothing.
 */
function copyMessage(name: string) {
	switch (name) {
		case 'assign':
			return { messageId: 'objectCopy', data: {} };
		case 'from':
		case 'slice':
			return { messageId: 'arrayCopy', data: {} };
		case 'concat':
			return { messageId: 'arrayMethodCopy', data: { mutator: 'push' } };
		case 'toSpliced':
			return { messageId: 'arrayMethodCopy', data: { mutator: 'splice' } };
		case 'toSorted':
			return { messageId: 'arrayMethodCopy', data: { mutator: 'sort' } };
		case 'toReversed':
			return { messageId: 'arrayMethodCopy', data: { mutator: 'reverse' } };
		case 'with':
			return { messageId: 'withCopy', data: {} };
		default:
			return null;
	}
}

/**
 * The reducer whose callback is the nearest function around a node: the first argument, through optional chains and
 * TypeScript assertions, of a `.reduce` or `.reduceRight` call with at most two arguments, whose first parameter is an
 * identifier, with or without a default. Returns `null` for a node in any other function or outside of one.
 */
function enclosingReducer(sourceCode: SourceCode, node: ESTree.Node) {
	const callback = enclosingCallback(node);
	if (callback === null) return null;
	const argument = outermostWrapper(callback);
	const { parent: owner } = argument;
	if (owner.type !== 'CallExpression') return null;

	const target = methodTarget(owner.callee);
	if (target === null) return null;
	const method = reducerMethod(target.name);
	const [callbackArgument, initialValue, ...rest] = owner.arguments;
	const [firstParameter] = callback.params;
	const accumulator =
		firstParameter?.type === 'AssignmentPattern' ? firstParameter.left : firstParameter;
	if (
		method === null ||
		rest.length > 0 ||
		callbackArgument !== argument ||
		accumulator?.type !== 'Identifier'
	) {
		return null;
	}

	const variable = sourceCode
		.getDeclaredVariables(callback)
		.find(({ identifiers }) => identifiers.includes(accumulator));
	if (typeof variable === 'undefined') {
		throw new AssertionError('a function declares a variable for each parameter name');
	}
	return { method, accumulator: variable, initialValue: initialValue ?? null } satisfies Reducer;
}

/** The method name of a reducer call: `reduce` or `reduceRight`, or `null` for any other method name. */
function reducerMethod(name: string) {
	switch (name) {
		case 'reduce':
		case 'reduceRight':
			return name;
		default:
			return null;
	}
}

/**
 * The function expression or arrow function that is the nearest function around a node, or `null` when that function
 * is a declaration or no function encloses the node.
 */
function enclosingCallback(node: ESTree.Node) {
	const callback = enclosingFunction(node);
	return callback?.type === 'FunctionDeclaration' ? null : callback;
}

/**
 * Whether a call of a copy method (see `copyMessage`) copies the accumulator: `Object.assign` of the global `Object`
 * into an object literal from the accumulator, `Array.from` of the global `Array` on the accumulator, or an array copy
 * method on an array accumulator.
 */
function copiesAccumulator(
	sourceCode: SourceCode,
	services: TypeServices | null,
	{ accumulator, initialValue }: Reducer,
	{ name, object, property }: MethodTarget,
	args: ESTree.Argument[],
) {
	switch (name) {
		case 'assign':
			return (
				isGlobal(sourceCode, object, 'Object') &&
				assignsFromAccumulator(sourceCode, accumulator, args)
			);
		case 'from': {
			const [source] = args;
			return (
				isGlobal(sourceCode, object, 'Array') &&
				typeof source !== 'undefined' &&
				source.type !== 'SpreadElement' &&
				aliasesAccumulator(sourceCode, accumulator, [], source)
			);
		}
		default:
			return (
				aliasesAccumulator(sourceCode, accumulator, [], object) &&
				((initialValue !== null &&
					initialValue.type !== 'SpreadElement' &&
					isKnownArrayExpression(sourceCode, initialValue)) ||
					(services !== null && isStandardArrayMethod(services, property)))
			);
	}
}

/** Whether the arguments of `Object.assign` copy the accumulator into an object literal target. */
function assignsFromAccumulator(
	sourceCode: SourceCode,
	accumulator: Variable,
	[target, ...sources]: ESTree.Argument[],
) {
	if (typeof target === 'undefined' || target.type === 'SpreadElement') return false;
	const object = unwrap(target);
	return (
		object.type === 'ObjectExpression' &&
		sources.some(
			source =>
				source.type !== 'SpreadElement' &&
				aliasesAccumulator(sourceCode, accumulator, [], source),
		)
	);
}

/** Whether an expression is the global with the given name, not a local binding that shadows it. */
function isGlobal(sourceCode: SourceCode, expression: ESTree.Expression, name: string) {
	const node = unwrap(expression);
	return node.type === 'Identifier' && node.name === name && sourceCode.isGlobalReference(node);
}

/**
 * Whether an expression reads the accumulator, directly or through never-reassigned `const` aliases. `visited` holds
 * the aliases already followed, so that a cycle of aliases ends.
 */
function aliasesAccumulator(
	sourceCode: SourceCode,
	accumulator: Variable,
	visited: Variable[],
	expression: ESTree.Expression,
): boolean {
	const node = unwrap(expression);
	if (node.type !== 'Identifier') return false;
	const variable = unvisitedVariable(sourceCode, visited, node);
	if (variable === accumulator) return true;
	if (variable === null || !isNeverReassigned(variable)) return false;
	const init = firstConstInitializer(variable);
	return init !== null && aliasesAccumulator(sourceCode, accumulator, visited, init);
}
