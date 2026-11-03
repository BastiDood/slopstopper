import type { ESTree, Visitor } from '@oxlint/plugins';

import { assertDefined } from '#assert.ts';
import {
	type CaseComparand,
	type CaseSide,
	caseSide,
	referenceKey,
	unwrap,
} from '#ast/discriminant.ts';
import { negatedNumber } from '#ast/literals.ts';
import { leadingOperand, logicalOperands } from '#ast/logical-operands.ts';
import { flipEquality, isEquality, isInequality } from '#ast/operators.ts';

/** The statements of a program, block, static block, namespace, or `switch` case. */
type StatementList = readonly (ESTree.Directive | ESTree.Statement)[];

/**
 * A decision that reads better as a `switch`: `if` statements that compare one discriminant against two or more
 * distinct case values with `===`, as the whole test or as the leading operand of an `&&` chain, owned by
 * `prefer-switch`. The decision covers the statements from `firstIndex`
 * to `lastIndex` of its list; `branches` holds its cases in source order, and `ending` says what becomes `default`.
 */
export interface SwitchDecision {
	kind: 'switch';
	head: ESTree.IfStatement;
	members: ESTree.IfStatement[];
	discriminant: ESTree.Expression;
	branches: SwitchBranch[];
	ending: SwitchEnding;
	statements: StatementList;
	firstIndex: number;
	lastIndex: number;
}

/**
 * A case member of a switch decision and the comparands of its test, one per `||` alternative, in source order. A test
 * `x === A && <rest>` names one case, and its `&&` chain is the `condition` that the case body still checks.
 */
export interface SwitchBranch {
	member: ESTree.IfStatement;
	comparands: ESTree.Expression[];
	condition: ESTree.LogicalExpression | null;
}

/**
 * What follows the last case of a switch decision: nothing (`open`), the `alternate` of the last case (`else`), a
 * trailing `guard` whose test names one more case `comparand`, or the `complement` of the last case.
 */
type SwitchEnding = OpenEnding | ElseEnding | GuardEnding | ComplementEnding;

/** A switch decision that ends without a `default`. */
interface OpenEnding {
	kind: 'open';
}

/** A switch decision whose final `else` becomes the `default`. */
interface ElseEnding {
	kind: 'else';
	alternate: ESTree.Statement;
}

/** A switch decision whose trailing guard names one more case and whose exit becomes the `default`. */
interface GuardEnding {
	kind: 'guard';
	guard: ESTree.IfStatement;
	comparand: ESTree.Expression;
}

/** A switch decision whose complement of the last case becomes the `default`. */
interface ComplementEnding {
	kind: 'complement';
	complement: ESTree.IfStatement;
}

/**
 * Two adjacent `if` statements without `else` whose tests split on one condition: one test holds `condition`, the
 * other holds `negation`. Owned by `merge-exclusive-branches`.
 */
export interface SplitDecision {
	kind: 'split';
	first: ESTree.IfStatement;
	second: ESTree.IfStatement;
	condition: ESTree.Expression;
	negation: ESTree.Expression;
}

type Decision = SwitchDecision | SplitDecision;

/** A statement list under split, with the rule's case comparands and the receiver of its decisions. */
interface ListWalk {
	statements: StatementList;
	isCaseComparand: CaseComparand;
	onDecision: (decision: Decision) => void;
}

/** Where an equality decision starts: a link of an `if`-`else` chain, its statement's index, and whether every earlier link of the chain always exits. */
interface ChainStart {
	link: ESTree.IfStatement;
	index: number;
	exits: boolean;
}

/** The cases of an equality decision so far. Unknown case values count as distinct. */
interface Cases {
	isCaseComparand: CaseComparand;
	key: string | null;
	discriminant: ESTree.Expression | null;
	values: string[];
	count: number;
	lastValue: string | null;
	branches: SwitchBranch[];
	ending: SwitchEnding | null;
}

/**
 * Visitor handlers that split every statement list of a file into decisions and pass each one to `onDecision`. An
 * `if` outside any statement list, such as a loop body without a block, forms a list of its own. Every list is entered
 * before the statements in it, so the decisions of an `if` are known before the visitor reaches the `if`. A rule
 * spreads the handlers into its own visitor.
 */
// oxlint-disable-next-line slopstopper/prefer-class-over-factory -- Oxlint and ESLint read a visitor's handlers with `Object.keys`, so they must be own properties of a plain object that rules spread into their visitor.
export function decisionVisitor(
	isCaseComparand: CaseComparand,
	onDecision: (decision: Decision) => void,
) {
	return {
		Program({ body }: ESTree.Program) {
			splitDecisions({ statements: body, isCaseComparand, onDecision });
		},
		BlockStatement({ body }: ESTree.BlockStatement) {
			splitDecisions({ statements: body, isCaseComparand, onDecision });
		},
		StaticBlock({ body }: ESTree.StaticBlock) {
			splitDecisions({ statements: body, isCaseComparand, onDecision });
		},
		SwitchCase({ consequent }: ESTree.SwitchCase) {
			splitDecisions({ statements: consequent, isCaseComparand, onDecision });
		},
		TSModuleBlock({ body }: ESTree.TSModuleBlock) {
			splitDecisions({ statements: body, isCaseComparand, onDecision });
		},
		IfStatement(node: ESTree.IfStatement) {
			const { parent } = node;
			const isElseIf = parent.type === 'IfStatement' && parent.alternate === node;
			if (isElseIf || holdsStatements(parent)) return;
			splitDecisions({ statements: [node], isCaseComparand, onDecision });
		},
	} satisfies Visitor;
}

/**
 * Splits a statement list into decisions, scanning it once in source order. Each `if` statement and each link of its
 * `else if` chain may start an equality decision; an `if` without `else` that starts none may pair with the next one
 * into a boolean split. A statement that a decision claims starts no other decision, so the decisions are disjoint.
 */
function splitDecisions(walk: ListWalk) {
	let index = 0;
	while (index < walk.statements.length) index = splitAt(walk, index);
}

/** Whether a node holds a statement list (see `StatementList`). */
export function holdsStatements(node: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the five statement-list holders matter, so `default` covers the rest.
	switch (node.type) {
		case 'Program':
		case 'BlockStatement':
		case 'StaticBlock':
		case 'TSModuleBlock':
		case 'SwitchCase':
			return true;
		default:
			return false;
	}
}

/** Splits the decisions that start in the statement at `index`, and returns the index of the next statement to split. */
function splitAt(walk: ListWalk, index: number) {
	const { statements, onDecision } = walk;
	const statement = assertDefined(statements[index]);
	if (statement.type !== 'IfStatement') return index + 1;

	let link: ESTree.Statement | null = statement;
	let at = index;
	let exits = true;

	while (link?.type === 'IfStatement') {
		const found = switchAt(walk, { link, index: at, exits });
		if (found !== null) {
			const { decision, last } = found;
			onDecision(decision);
			at = decision.lastIndex;
			({ exits } = found);
			link = last.alternate;
			continue;
		}

		const next = statements[at + 1];
		if (
			link === statements[at] &&
			link.alternate === null &&
			next?.type === 'IfStatement' &&
			next.alternate === null
		) {
			const split = findSplit(link, next);
			if (split !== null) {
				onDecision(split);
				return at + 2;
			}
		}

		exits &&= alwaysExits(link.consequent);
		link = link.alternate;
	}
	return at + 1;
}

/**
 * The equality decision that starts at a chain link, or `null` when it compares fewer than two distinct case values.
 * A member continues through its `else if`, and, while every branch so far always exits, through the next statement.
 * After the last case, the complement `x !== A` of that case, or a trailing guard (see `addDefault`), becomes `default`.
 * Also returns the last member and whether every member always exits.
 */
function switchAt(
	{ statements, isCaseComparand }: ListWalk,
	{ link: head, index: firstIndex, exits: headExits }: ChainStart,
) {
	const cases: Cases = {
		isCaseComparand,
		key: null,
		discriminant: null,
		values: [],
		count: 0,
		lastValue: null,
		branches: [],
		ending: null,
	};

	const members: ESTree.IfStatement[] = [];
	let link = head;
	let index = firstIndex;
	let exits = headExits;
	let lastIndex = index;
	let isSibling = false;

	while (true) {
		if (!addCases(cases, link)) {
			if (isSibling && addDefault(cases, link, exits)) {
				members.push(link);
				lastIndex = index;
			}
			break;
		}

		members.push(link);
		lastIndex = index;

		const exitsBefore = exits;
		exits &&= alwaysExits(link.consequent);

		const { alternate } = link;
		if (alternate?.type === 'IfStatement') {
			link = alternate;
			isSibling = false;
			continue;
		}

		const next = statements[index + 1];
		if (alternate !== null || !exitsBefore || next?.type !== 'IfStatement') break;
		++index;
		if (!exits) {
			if (addDefault(cases, next, exits)) {
				members.push(next);
				lastIndex = index;
			}
			break;
		}

		link = next;
		isSibling = true;
	}

	if (cases.discriminant === null || cases.count < 2 || members.length < 2) return null;

	const last = assertDefined(members.at(-1));
	const decision = {
		kind: 'switch',
		head,
		members,
		discriminant: cases.discriminant,
		branches: cases.branches,
		ending:
			cases.ending ??
			(last.alternate === null
				? { kind: 'open' }
				: { kind: 'else', alternate: last.alternate }),
		statements,
		firstIndex,
		lastIndex,
	} satisfies SwitchDecision;
	return { decision, last, exits };
}

/**
 * Adds the cases of a member's test to the decision when every `||` alternative compares the decision's discriminant
 * with `===` against a case comparand, or when the test is an `&&` chain whose leading operand is such a comparison.
 * Returns `false`, adding nothing, when any alternative does not fit.
 *
 * A failed `<rest>` of `x === A && <rest>` leaves the decision like a `break` from `case A` does: no later test of the
 * decision can hold for the same value, so only a final `else` or a `default` would still run.
 */
function addCases(cases: Cases, member: ESTree.IfStatement) {
	const { test } = member;
	const condition = test.type === 'LogicalExpression' && test.operator === '&&' ? test : null;
	const comparisons =
		condition === null ? logicalOperands(test, '||') : [leadingOperand(condition, '&&')];

	const sides: CaseSide[] = [];
	let { key } = cases;
	for (const comparison of comparisons) {
		const side = caseSide(cases.isCaseComparand, '===', comparison);
		if (side === null || (key !== null && side.key !== key)) return false;
		({ key } = side);
		sides.push(side);
	}

	cases.key = key;
	const comparands: ESTree.Expression[] = [];
	let value: string | null = null;
	for (const side of sides) {
		cases.discriminant ??= side.node;
		value = operandKey(side.comparand);
		addValue(cases, value);
		comparands.push(side.comparand);
	}

	cases.lastValue = sides.length === 1 ? value : null;
	cases.branches.push({ member, comparands, condition });
	return true;
}

/**
 * Adds a branch that becomes `default` after the last case: the complement `x !== A` of that case, or, when every
 * branch so far exits, a trailing guard `if (x !== A) <exit>` or `if (x !== A || <rest>) <exit>` that adds case `A`,
 * whose body is the code after the guard. Returns whether the statement is such a branch. No case may hold a
 * `condition`, because the `default` must also run when that condition fails.
 */
function addDefault(cases: Cases, statement: ESTree.IfStatement, exits: boolean) {
	if (
		statement.alternate !== null ||
		cases.branches.some(({ condition }) => condition !== null)
	) {
		return false;
	}

	const { test } = statement;
	const complement = caseSide(cases.isCaseComparand, '!==', test);
	if (
		complement?.key === cases.key &&
		cases.lastValue !== null &&
		operandKey(complement.comparand) === cases.lastValue
	) {
		cases.ending = { kind: 'complement', complement: statement };
		return true;
	}

	if (!exits || !alwaysExits(statement.consequent)) return false;
	const guard = leadingOperand(test, '||');
	const side = guard === test ? complement : caseSide(cases.isCaseComparand, '!==', guard);
	if (side === null || side.key !== cases.key) return false;
	addValue(cases, operandKey(side.comparand));
	cases.ending = { kind: 'guard', guard: statement, comparand: side.comparand };
	return true;
}

/** Counts a case value unless an earlier case names it. An unknown value always counts. */
function addValue(cases: Cases, value: string | null) {
	if (value !== null && cases.values.includes(value)) return;
	++cases.count;
	if (value !== null) cases.values.push(value);
}

/**
 * Whether a statement always exits: a `return`, `throw`, `continue`, or `break`, alone or as the last statement of a
 * block. An unlabeled `break` counts too; `prefer-switch` skips decisions that hold one.
 */
export function alwaysExits(statement: ESTree.Directive | ESTree.Statement): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only exits and blocks matter, so `default` covers the rest.
	switch (statement.type) {
		case 'ReturnStatement':
		case 'ThrowStatement':
		case 'ContinueStatement':
		case 'BreakStatement':
			return true;
		case 'BlockStatement': {
			const last = statement.body.at(-1);
			return typeof last !== 'undefined' && alwaysExits(last);
		}
		default:
			return false;
	}
}

/**
 * The boolean split between two `if` statements: the first operand pair of their tests where one operand negates the
 * other, keeping the positive one as the condition. An operand is the whole test or a top-level `&&` operand.
 */
function findSplit(first: ESTree.IfStatement, second: ESTree.IfStatement) {
	const secondOperands = logicalOperands(second.test, '&&').map(operand => ({
		operand,
		target: unwrap(operand),
	}));
	for (const left of logicalOperands(first.test, '&&')) {
		const leftTarget = unwrap(left);
		for (const { operand: right, target: rightTarget } of secondOperands) {
			if (negates(rightTarget, leftTarget)) {
				return {
					kind: 'split',
					first,
					second,
					condition: left,
					negation: right,
				} satisfies SplitDecision;
			}
			if (negates(leftTarget, rightTarget)) {
				return {
					kind: 'split',
					first,
					second,
					condition: right,
					negation: left,
				} satisfies SplitDecision;
			}
		}
	}
	return null;
}

/**
 * Whether `negation` is `!condition`, or the inverse equality comparison (`!==` for `===`, `!=` for `==`) of the same
 * operands. Expects both nodes without wrappers (see `unwrap`).
 */
function negates(negation: ESTree.Expression, condition: ESTree.Expression) {
	if (negation.type === 'UnaryExpression') {
		const key = negation.operator === '!' ? conditionKey(unwrap(negation.argument)) : null;
		return key !== null && key === conditionKey(condition);
	}

	return (
		negation.type === 'BinaryExpression' &&
		condition.type === 'BinaryExpression' &&
		isInequality(negation.operator) &&
		flipEquality(negation.operator) === condition.operator &&
		negation.left.type !== 'PrivateIdentifier' &&
		sameOperand(negation.left, condition.left) &&
		sameOperand(negation.right, condition.right)
	);
}

/**
 * A structural key for a condition: a reference (see `referenceKey`), its `!` negation, or an equality comparison of
 * references and literals. Returns `null` for anything else, such as calls. Expects a node without wrappers (see
 * `unwrap`).
 */
function conditionKey(target: ESTree.Expression): string | null {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only negations and comparisons wrap other conditions, so `default` covers the rest.
	switch (target.type) {
		case 'UnaryExpression': {
			if (target.operator !== '!') return null;
			const key = conditionKey(unwrap(target.argument));
			return key === null ? null : `!${key}`;
		}
		case 'BinaryExpression': {
			if (target.left.type === 'PrivateIdentifier' || !isEquality(target.operator)) {
				return null;
			}

			const left = operandKey(target.left);
			const right = operandKey(target.right);
			return left === null || right === null ? null : `${left}${target.operator}${right}`;
		}
		default:
			return referenceKey(target);
	}
}

function sameOperand(left: ESTree.Expression, right: ESTree.Expression) {
	const key = operandKey(left);
	return key !== null && key === operandKey(right);
}

/**
 * A structural key for a comparison operand: a reference, `undefined`, or the type and value of a literal, a template
 * literal without expressions, or a negated number. Returns `null` for anything else.
 */
function operandKey(node: ESTree.Expression) {
	const target = unwrap(node);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only references and literals have a structural key, so `default` covers the rest.
	switch (target.type) {
		case 'Literal':
			return 'regex' in target ? null : `${typeof target.value}:${String(target.value)}`;
		case 'TemplateLiteral': {
			const [quasi] = target.quasis;
			const { value } = assertDefined(quasi);
			const { cooked } = value;
			return target.expressions.length === 0 && typeof cooked === 'string'
				? `string:${cooked}`
				: null;
		}
		case 'UnaryExpression': {
			const value = negatedNumber(target);
			return value === null ? null : `number:${String(value)}`;
		}
		case 'Identifier':
			return target.name;
		default:
			return referenceKey(target);
	}
}
