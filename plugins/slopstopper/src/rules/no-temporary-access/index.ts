import { defineRule, type ESTree, type Fix, type Scope, type SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { isBound } from '#ast/bindings.ts';
import { holdsStatements } from '#ast/decisions.ts';
import { messageLabel } from '#ast/labels.ts';
import { indentation } from '#ast/layout.ts';
import { isCallee, outermostWrapper } from '#ast/members.ts';
import { BINDABLE_NAME_REGEX, isReservedWord } from '#ast/names.ts';
import { isLogicalAssignment } from '#ast/operators.ts';
import { propertyName } from '#ast/property-keys.ts';
import { dropsComment } from '#ast/ranges.ts';

/** The refactor that a report asks for, named by its message. */
type Refactor =
	| 'bindResult'
	| 'bindOptionalResult'
	| 'bindInLoop'
	| 'bindInBranch'
	| 'bindInArrowBody';

/**
 * Reports a field read off the unnamed result of a call or `new` expression, such as `f().x`, `f()[k]`, or `f()?.x`.
 * Binding the result to a `const` gives it an explicit lifetime, so that code reuses the result instead of calling the
 * function again. A method call, such as `f().g()`, reads no field, and a field read that receives a method call, such
 * as `expect(x).not.toThrow()`, is allowed. The fix destructures the result when the read is
 * the whole initializer of a lone `const` declarator, and declares the destructuring before a `for…of`, `return`,
 * `throw`, or `if` statement whose iterable, argument, or test is the whole read.
 */
export const NO_TEMPORARY_ACCESS = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description: 'Bind the result of a call to a `const` before reading a field off it.',
		},
		messages: {
			bindResult:
				'Bind `{{call}}` to a `const` first, so that its result is reused instead of recomputed.',
			bindOptionalResult:
				'Bind `{{call}}` to a `const` first, then check it for `undefined`, so that its result is reused instead of recomputed.',
			bindInLoop:
				'Bind the result of `{{call}}` inside a `while (true)` loop body and `break` on the condition, so that its result is reused instead of recomputed.',
			bindInBranch:
				'Bind the result of `{{call}}` inside the branch where the call runs, so that its result is reused instead of recomputed.',
			bindInArrowBody:
				'Turn the arrow body into a block and bind the result of `{{call}}` there, so that its result is reused instead of recomputed.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const claims = new Map<Scope, Set<string>>();

		return {
			MemberExpression(node) {
				const call = unwrapTypes(node.object);
				if (!isTemporary(call)) return;
				const wrapper = outermostWrapper(node);
				if (isCallee(wrapper) || isReceiver(wrapper)) return;

				// The fix runs inside `report`, so the rewrites claim their names in report order.
				context.report({
					node,
					messageId: refactorOf(node),
					data: { call: messageLabel(sourceCode.getText(call)) },
					fix: () => rewriteOf(sourceCode, claims, node),
				});
			},
		};
	},
});

/** Strips TypeScript assertions, but not optional chains. */
function unwrapTypes(node: ESTree.Expression): ESTree.Expression {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (node.type) {
		case 'TSNonNullExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
			return unwrapTypes(node.expression);
		default:
			return node;
	}
}

/** Whether an expression produces an unnamed result: a call or a `new` expression. */
function isTemporary(node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only calls and `new` expressions count, so `default` covers the rest.
	switch (node.type) {
		case 'CallExpression':
		case 'NewExpression':
			return true;
		default:
			return false;
	}
}

/**
 * Whether a field read is the receiver of a method call, as `.not` is in `expect(x).not.toThrow()`. Expects the
 * outermost wrapper around the read (see `outermostWrapper`).
 */
function isReceiver(wrapper: ESTree.Expression) {
	const { parent } = wrapper;
	return (
		parent.type === 'MemberExpression' &&
		parent.object === wrapper &&
		isCallee(outermostWrapper(parent))
	);
}

/**
 * The edits that bind the call result, or `null` when no rewrite provably keeps the behavior. The read must spell out
 * a bindable name and hold no comment that the rewrite would drop. A lone `const` declarator destructures the result in
 * place. A `for…of`, `return`, `throw`, or `if` statement gets the destructuring on its own line before it, under a
 * name that it can claim (see `claimName`).
 */
function rewriteOf(
	sourceCode: SourceCode,
	claims: Map<Scope, Set<string>>,
	node: ESTree.MemberExpression,
) {
	const name = readName(node);
	if (name === null) return null;

	const object = sourceCode.getText(node.object);
	const target = constTarget(node);
	if (target !== null) {
		const { declarator, id } = target;
		if (dropsComment(sourceCode, { range: declarator.range, kept: [node.object.range] })) {
			return null;
		}

		const pattern = id.name === name ? name : `${name}: ${id.name}`;
		return [{ range: declarator.range, text: `{ ${pattern} } = ${object}` }] satisfies Fix[];
	}

	const statement = hoistingStatement(node);
	if (
		statement === null ||
		isReservedWord(name) ||
		dropsComment(sourceCode, { range: node.range, kept: [node.object.range] }) ||
		!claimName(sourceCode, claims, statement, name)
	) {
		return null;
	}

	const [start] = statement.range;
	const declaration = `const { ${name} } = ${object};\n${indentation(sourceCode, statement)}`;
	return [
		{ range: [start, start], text: declaration },
		{ range: node.range, text: name },
	] satisfies Fix[];
}

/** The name that a read spells out statically and that a destructuring can spell out, or `null` for any other read. */
function readName({ property, computed }: ESTree.MemberExpression) {
	const name = propertyName(property, computed);
	return name !== null && BINDABLE_NAME_REGEX.test(name) ? name : null;
}

/**
 * The declarator whose whole initializer is the read, with its identifier, when it is the only declarator of a `const`
 * declaration and has no type annotation.
 */
function constTarget(node: ESTree.MemberExpression) {
	const declarator = node.parent;
	if (
		declarator.type !== 'VariableDeclarator' ||
		declarator.init !== node ||
		declarator.id.type !== 'Identifier' ||
		(declarator.id.typeAnnotation ?? null) !== null
	) {
		return null;
	}

	const declaration = declarator.parent;
	return declaration.type === 'VariableDeclaration' &&
		declaration.kind === 'const' &&
		onlyElement(declaration.declarations) === declarator
		? { declarator, id: declarator.id }
		: null;
}

/**
 * The statement before which the fix declares the result: a `for…of` statement whose iterable is the read, or a
 * `return`, `throw`, or `if` statement whose argument or test is the read. The statement must sit directly in a block
 * or program, so that the declaration runs right before it and nowhere else. A `switch` case does not count, because
 * its declarations belong to the whole `switch`.
 */
function hoistingStatement(node: ESTree.MemberExpression) {
	const statement = node.parent;
	const list = statement.parent;
	return list !== null &&
		holdsStatements(list) &&
		list.type !== 'SwitchCase' &&
		isHoistingHead(statement, node)
		? statement
		: null;
}

/** Whether a statement evaluates the read first and once: as a `for…of` iterable, or as an argument or `if` test. */
function isHoistingHead(statement: ESTree.Node, node: ESTree.MemberExpression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these four statements can declare the result before them, so `default` covers the rest.
	switch (statement.type) {
		case 'ForOfStatement':
			return statement.right === node;
		case 'ReturnStatement':
		case 'ThrowStatement':
		case 'IfStatement':
			return true;
		default:
			return false;
	}
}

/**
 * Claims a name for a declaration before a statement, in the scope that the declaration joins. Fails when the name
 * resolves in that scope or in the statement's own scope, such as a `for…of` variable, when code there reads a global
 * of that name, or when another fix in the file already claims the name in that scope.
 */
function claimName(
	sourceCode: SourceCode,
	claims: Map<Scope, Set<string>>,
	statement: ESTree.Node,
	name: string,
) {
	const scope = sourceCode.getScope(statement);
	const enclosing = scope.block === statement ? scope.upper : scope;
	if (
		enclosing === null ||
		isBound(scope, name) ||
		(enclosing !== scope && isBound(enclosing, name))
	) {
		return false;
	}

	const names = claims.get(enclosing) ?? new Set<string>();
	if (names.has(name)) return false;
	claims.set(enclosing, names.add(name));
	return true;
}

/**
 * The refactor that a read asks for. An optional read asks for an `undefined` check. Otherwise the innermost context
 * that evaluates the read repeatedly or only sometimes decides, up to the enclosing function or class body.
 */
function refactorOf(node: ESTree.MemberExpression) {
	if (node.optional) return 'bindOptionalResult';

	let child: ESTree.Node = node;
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		const refactor = refactorIn(current, child);
		if (refactor !== null) return refactor;
		child = current;
		current = current.parent;
	}
	return 'bindResult';
}

/**
 * The refactor that a context asks for when it evaluates `child`: a loop condition or update runs on every iteration;
 * the right side of a logical operator or a logical assignment, a conditional branch, and a default value run only
 * sometimes; and an arrow
 * expression body has no statement to bind in. A function or class body ends the search with a plain binding. Returns
 * `null` for any other context, so that the search continues outward.
 */
function refactorIn(parent: ESTree.Node, child: ESTree.Node): Refactor | null {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (parent.type) {
		case 'WhileStatement':
		case 'DoWhileStatement':
			return parent.test === child ? 'bindInLoop' : null;
		case 'ForStatement':
			return parent.test === child || parent.update === child ? 'bindInLoop' : null;
		case 'LogicalExpression':
		case 'AssignmentPattern':
			return parent.right === child ? 'bindInBranch' : null;
		case 'AssignmentExpression':
			return isLogicalAssignment(parent.operator) && parent.right === child
				? 'bindInBranch'
				: null;
		case 'ConditionalExpression':
			return parent.test === child ? null : 'bindInBranch';
		case 'ArrowFunctionExpression':
			return parent.expression && parent.body === child ? 'bindInArrowBody' : 'bindResult';
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ClassBody':
			return 'bindResult';
		default:
			return null;
	}
}
