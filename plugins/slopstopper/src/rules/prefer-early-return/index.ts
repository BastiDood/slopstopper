import {
	type Context,
	defineRule,
	type ESTree,
	type Range,
	type SourceCode,
} from '@oxlint/plugins';

import { assertDefined } from '#assert.ts';
import { isBound } from '#ast/bindings.ts';
import { caseComparandsOf } from '#ast/case-comparand.ts';
import { alwaysExits } from '#ast/decisions.ts';
import { type CaseComparand, unwrap } from '#ast/discriminant.ts';
import { messageLabel } from '#ast/labels.ts';
import { indentation } from '#ast/layout.ts';
import { logicalOperands } from '#ast/logical-operands.ts';
import { isNegated, negatedText } from '#ast/negation.ts';
import { dropsComment, isWithin } from '#ast/ranges.ts';
import { type TypeServices, typeAtLocation, typeServicesOf } from '#type-services.ts';

/** What checking a statement list needs from its file: the case comparands of its tests and its type services. */
interface FileContext {
	isCaseComparand: CaseComparand;
	services: TypeServices | null;
}

/** An `if` without `else` in a statement list, the statements of its branch, and the statements that follow it. */
interface Split {
	statement: ESTree.IfStatement;
	branch: readonly ESTree.Statement[];
	tail: readonly ESTree.Statement[];
}

/** The values of an `if (test) return a;` that the next statement, `return b;`, completes, or the same for `throw`. */
interface ExitPair {
	keyword: 'return' | 'throw';
	statement: ESTree.IfStatement;
	test: ESTree.Expression;
	consequent: ESTree.Expression;
	alternate: ESTree.Expression;
	end: number;
}

/**
 * Reports an `if` without `else` in a statement list whose branch and the statements after it both exit, where one of
 * them could be shorter or simpler. An `if (c) return a;` followed by `return b;` reads as one `return c ? a : b;`. So
 * does a pair of `throw` statements. A boolean literal on one side of a `return` pair reads as an `||` or `&&` chain
 * instead. A branch of more lines than the statements after it reads better inverted. The shorter statements then exit
 * first. The longer branch then runs without nesting. An exit is a `return`, `throw`, `continue`, or `break` (see
 * `exits`). With type information, a call that returns `never` exits too. The ternary and the inversion are fixes. Both
 * keep every evaluation and exit. The inversion has no fix where moving the code would change a binding (see
 * `movesSafely`), or where its guard would end in a call (see `endsInCall`).
 */
export const PREFER_EARLY_RETURN = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		hasSuggestions: true,
		docs: {
			description:
				'Prefer one ternary over an `if` that exits before a matching exit. Prefer the shorter exit first.',
		},
		messages: {
			ternaryExit:
				'`if ({{test}}) {{keyword}} …;` and the `{{keyword}}` after it choose one value. Write `{{keyword}} {{test}} ? … : …` instead.',
			booleanReturn:
				'`if ({{test}}) return {{literal}};` and the `return` after it form a boolean. Return an `{{operator}}` chain of the test and the other value instead.',
			chainReturn:
				'Return an `{{operator}}` chain. It equals the two returns only for a boolean test. If the test can be another value, suppress this diagnostic instead.',
			shorterBranchFirst:
				'The branch of `if ({{test}})` spans {{branchLines}} lines. The exit after it spans {{tailLines}}. Invert the test so that the shorter exit runs first. The longer branch then runs without nesting.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const file = {
			isCaseComparand: caseComparandsOf(sourceCode),
			services: typeServicesOf(sourceCode),
		} satisfies FileContext;
		return {
			BlockStatement({ body }) {
				checkList(context, file, body);
			},
			SwitchCase({ consequent }) {
				checkList(context, file, consequent);
			},
		};
	},
});

/** Reports each `if` without `else` of a statement list that a ternary, a chain, or an inversion would simplify. */
function checkList(
	context: Context,
	{ isCaseComparand, services }: FileContext,
	statements: readonly ESTree.Statement[],
) {
	for (const [index, statement] of statements.entries()) {
		if (statement.type !== 'IfStatement' || statement.alternate !== null) continue;
		const tail = statements.slice(index + 1);
		const pair = exitPairOf(statement, tail);
		if (pair !== null) {
			reportPair(context, isCaseComparand, pair);
			continue;
		}
		const split = splitOf(services, statement, tail);
		if (split !== null) reportSplit(context, isCaseComparand, split);
	}
}

/**
 * The values of `if (test) return a;` with `return b;` as the next statement, or of `if (test) throw a;` with
 * `throw b;`, or `null` for any other `if`. The branch may hold its statement in a block of its own.
 */
function exitPairOf(statement: ESTree.IfStatement, tail: readonly ESTree.Statement[]) {
	const exit = exitOf(soleStatement(statement.consequent));
	const [next] = tail;
	if (exit === null || typeof next === 'undefined') return null;
	const following = exitOf(next);
	return following?.keyword === exit.keyword
		? ({
				keyword: exit.keyword,
				statement,
				test: statement.test,
				consequent: exit.value,
				alternate: following.value,
				end: next.range[1],
			} satisfies ExitPair)
		: null;
}

/** The statement of a branch: the branch itself, or the only statement of its block, or `null` for any other block. */
function soleStatement(branch: ESTree.Statement) {
	if (branch.type !== 'BlockStatement') return branch;
	return branch.body.length === 1 ? assertDefined(branch.body[0]) : null;
}

/** The keyword and value of a `return` with an argument or of a `throw`, or `null` for any other statement. */
function exitOf(statement: ESTree.Statement | null) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a `return` and a `throw` carry a value, so `default` covers the rest.
	switch (statement?.type) {
		case 'ReturnStatement':
			return statement.argument === null
				? null
				: { keyword: 'return' as const, value: statement.argument };
		case 'ThrowStatement':
			return { keyword: 'throw' as const, value: statement.argument };
		default:
			return null;
	}
}

/**
 * Reports an exit pair. A `return` pair with a boolean literal on exactly one side gets a chain as a suggestion. That
 * chain returns the test itself where the literal stood. It equals the ternary only for a boolean test. A pair of two
 * literals is left to `no-unneeded-ternary`. A pair that already holds a conditional, as its test or a value, is left
 * alone, as `no-nested-ternary` asks. Any other pair gets the ternary as a fix. A negated test is inverted with its
 * branches swapped, as `no-negated-condition` asks.
 */
function reportPair(context: Context, isCaseComparand: CaseComparand, pair: ExitPair) {
	const { sourceCode } = context;
	const { keyword, statement, test, consequent, alternate } = pair;
	const data = { test: messageLabel(sourceCode.getText(test)) };
	const literal =
		keyword === 'return' ? (booleanValue(consequent) ?? booleanValue(alternate)) : null;
	if (literal !== null) {
		if (booleanValue(consequent) !== null && booleanValue(alternate) !== null) return;
		const operator = literal ? '||' : '&&';
		context.report({
			node: statement,
			messageId: 'booleanReturn',
			data: { ...data, literal: String(literal), operator },
			suggest: [
				{
					messageId: 'chainReturn',
					data: { operator },
					fix(fixer) {
						const text = chainText(sourceCode, isCaseComparand, pair, operator);
						return text === null
							? null
							: fixer.replaceTextRange([statement.range[0], pair.end], text);
					},
				},
			],
		});
		return;
	}
	if ([test, consequent, alternate].some(node => node.type === 'ConditionalExpression')) return;
	context.report({
		node: statement,
		messageId: 'ternaryExit',
		data: { ...data, keyword },
		fix(fixer) {
			const text = ternaryText(sourceCode, isCaseComparand, pair);
			return text === null
				? null
				: fixer.replaceTextRange([statement.range[0], pair.end], text);
		},
	});
}

/**
 * The text of the chain that replaces a pair with one boolean literal, or `null` when the rewrite would drop a comment.
 * `true` gives an `||` chain. `false` gives an `&&` chain. The chain keeps the test where the literal stands in the
 * branch as `true`, or after it as `false`. Otherwise it negates the test. So `c ? true : d` becomes `c || d`, and
 * `c ? false : d` becomes `!c && d`.
 */
function chainText(
	sourceCode: SourceCode,
	isCaseComparand: CaseComparand,
	pair: ExitPair,
	operator: '||' | '&&',
) {
	const { statement, test, consequent, alternate, end } = pair;
	const literalInBranch = booleanValue(consequent) !== null;
	const other = literalInBranch ? alternate : consequent;
	const kept = [test.range, other.range];
	if (dropsComment(sourceCode, { range: [statement.range[0], end], kept })) return null;
	const condition =
		literalInBranch === (operator === '||')
			? chainOperand(sourceCode.getText(test), test.type)
			: chainOperand(negatedText(sourceCode, isCaseComparand, test), negationType(test));
	return `return ${condition} ${operator} ${chainOperand(sourceCode.getText(other), other.type)};`;
}

/** The value of a `true` or `false` literal, or `null` for any other expression. */
function booleanValue(node: ESTree.Expression) {
	return node.type === 'Literal' && typeof node.value === 'boolean' ? node.value : null;
}

/** The text of a chain operand, in parentheses when its expression binds more loosely than `&&`. */
function chainOperand(text: string, type: ESTree.Expression['type']) {
	return bindsLooserThanAnd(type) ? `(${text})` : text;
}

/**
 * The type of the expression that the negation of a test gives (see `negatedText`): the operand of a `!`, or a logical
 * chain for a distributed chain. Any other test turns into a `!` or a flipped comparison, which binds tightly.
 */
function negationType(test: ESTree.Expression) {
	if (test.type === 'UnaryExpression' && test.operator === '!') return test.argument.type;
	return test.type === 'LogicalExpression' ? test.type : 'UnaryExpression';
}

/**
 * Whether an expression needs parentheses as an operand of `&&` or `||`. A logical chain counts, whatever its
 * operator.
 */
function bindsLooserThanAnd(type: ESTree.Expression['type']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Every other expression binds at least as tightly as `&&`.
	switch (type) {
		case 'LogicalExpression':
		case 'ConditionalExpression':
		case 'AssignmentExpression':
		case 'SequenceExpression':
		case 'ArrowFunctionExpression':
		case 'YieldExpression':
			return true;
		default:
			return false;
	}
}

/**
 * The text of `return test ? a : b;`, or `null` when the rewrite would drop a comment. A test that reads better
 * inverted (see `readsNegated`) is inverted. Its branches swap, so that the ternary reads affirmatively.
 */
function ternaryText(sourceCode: SourceCode, isCaseComparand: CaseComparand, pair: ExitPair) {
	const { keyword, statement, test, consequent, alternate, end } = pair;
	const kept = [test.range, consequent.range, alternate.range];
	if (dropsComment(sourceCode, { range: [statement.range[0], end], kept })) return null;
	const inverted = readsNegated(test);
	const condition = inverted
		? negatedText(sourceCode, isCaseComparand, test)
		: conditionText(sourceCode, test);
	const [first, second] = inverted ? [alternate, consequent] : [consequent, alternate];
	return `${keyword} ${condition} ? ${branchText(sourceCode, first)} : ${branchText(sourceCode, second)};`;
}

/**
 * Whether a ternary test reads better inverted: a negation, as `no-negated-condition` sees it, or an `&&` or `||` chain
 * whose negated operands outnumber what De Morgan's law leaves behind, as `prefer-de-morgan` counts them.
 */
function readsNegated(test: ESTree.Expression) {
	if (isNegated(test)) return true;
	if (test.type !== 'LogicalExpression' || test.operator === '??') return false;
	const operands = logicalOperands(test, test.operator);
	const { length: negated } = operands.filter(operand => isNegated(operand));
	return negated > 1 + operands.length - negated;
}

/** The text of a ternary test, in parentheses when it binds more loosely than the conditional operator. */
function conditionText(sourceCode: SourceCode, test: ESTree.Expression) {
	const text = sourceCode.getText(test);
	return bindsLooserThanConditional(test.type) ? `(${text})` : text;
}

/** Whether an expression needs parentheses as the test of a conditional. */
function bindsLooserThanConditional(type: ESTree.Expression['type']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Every other expression binds at least as tightly as a conditional test.
	switch (type) {
		case 'ArrowFunctionExpression':
		case 'AssignmentExpression':
		case 'ConditionalExpression':
		case 'SequenceExpression':
		case 'YieldExpression':
			return true;
		default:
			return false;
	}
}

/** The text of a ternary branch, in parentheses when it is a comma expression. */
function branchText(sourceCode: SourceCode, node: ESTree.Expression) {
	const text = sourceCode.getText(node);
	return node.type === 'SequenceExpression' ? `(${text})` : text;
}

/**
 * The split of an `if` without `else` whose block branch and following statements both end in an exit, where the
 * following statements span at least two lines fewer than the branch, or `null` for any other `if`. The margin keeps
 * an inversion that the formatter rewraps from qualifying for the inverse inversion.
 */
function splitOf(
	services: TypeServices | null,
	statement: ESTree.IfStatement,
	tail: readonly ESTree.Statement[],
) {
	const { consequent } = statement;
	const last = tail.at(-1);
	if (consequent.type !== 'BlockStatement' || typeof last === 'undefined') return null;
	const branch = consequent.body;
	if (branch.length === 0 || !exits(services, consequent) || !exits(services, last)) return null;
	return lineCount(tail) + 2 <= lineCount(branch)
		? ({ statement, branch, tail } satisfies Split)
		: null;
}

/**
 * Whether a statement always exits (see `alwaysExits`), or calls a function that returns `never`. The call needs type
 * information, which tells it from any other call. A block exits when its last statement does.
 */
function exits(services: TypeServices | null, statement: ESTree.Statement): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a block and an expression statement can end in a call, so `default` covers the rest.
	switch (statement.type) {
		case 'BlockStatement': {
			const last = statement.body.at(-1);
			return typeof last !== 'undefined' && exits(services, last);
		}
		case 'ExpressionStatement':
			return callsNever(services, statement.expression);
		default:
			return alwaysExits(statement);
	}
}

/**
 * Whether an expression is a call, or an awaited call, whose type is `never`. Only `never` is assignable to
 * `never`.
 */
function callsNever(services: TypeServices | null, expression: ESTree.Expression) {
	const call = unwrap(expression);
	const awaited = call.type === 'AwaitExpression' ? unwrap(call.argument) : call;
	if (services === null || awaited.type !== 'CallExpression') return false;
	const type = typeAtLocation(services, expression);
	const { checker } = services;
	return type !== null && checker.isTypeAssignableTo(type, checker.getNeverType());
}

/**
 * Reports a split. Its fix inverts the test and moves the following statements into the `if`. The branch follows it
 * without its block. The fix is skipped when the move would change a binding (see `movesSafely`). It is also skipped
 * when the guard would end in a call that returns `never` (see `endsInCall`).
 */
function reportSplit(context: Context, isCaseComparand: CaseComparand, split: Split) {
	const { sourceCode } = context;
	const { statement, branch, tail } = split;
	context.report({
		node: statement,
		messageId: 'shorterBranchFirst',
		data: {
			test: messageLabel(sourceCode.getText(statement.test)),
			branchLines: String(lineCount(branch)),
			tailLines: String(lineCount(tail)),
		},
		fix(fixer) {
			const tailRange = spanOf(tail);
			const last = assertDefined(tail.at(-1));
			if (!movesSafely(sourceCode, statement, tailRange) || endsInCall(last)) return null;
			const text = invertedText(sourceCode, isCaseComparand, split);
			return text === null
				? null
				: fixer.replaceTextRange([statement.range[0], tailRange[1]], text);
		},
	});
}

/** The number of lines from the first to the last of some statements. */
function lineCount(statements: readonly ESTree.Statement[]) {
	const {
		loc: {
			start: { line: first },
		},
	} = assertDefined(statements[0]);
	const {
		loc: {
			end: { line: last },
		},
	} = assertDefined(statements.at(-1));
	return last - first + 1;
}

/**
 * Whether an inversion keeps every binding. The names that the branch declares move out of its block. They must be
 * free at the `if`, so that the move neither redeclares a name nor shadows one that the code around it reads. The
 * declarations of the following statements move into a block. Code outside those statements must not read them, as
 * the branch would read a function that the statements after it declare.
 */
function movesSafely(sourceCode: SourceCode, statement: ESTree.IfStatement, tailRange: Range) {
	const { variables: moved } = sourceCode.getScope(statement.consequent);
	const scope = sourceCode.getScope(statement);
	return (
		!moved.some(({ name }) => isBound(scope, name)) &&
		!scope.variables.some(
			({ defs, references }) =>
				defs.some(({ node }) => isWithin(node.range, tailRange)) &&
				!references.every(({ identifier }) => isWithin(identifier.range, tailRange)),
		)
	);
}

/**
 * Whether a statement ends in a call: the exit that a call of a `never` function makes (see `exits`). TypeScript
 * narrows after such a call only when the function has an explicit type annotation. A guard that ends in one can
 * lose the narrowing that the block gave the branch.
 */
function endsInCall(statement: ESTree.Statement): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only an expression statement and a block can end in a call, so `default` covers the rest.
	switch (statement.type) {
		case 'ExpressionStatement':
			return true;
		case 'BlockStatement': {
			const last = statement.body.at(-1);
			return typeof last !== 'undefined' && endsInCall(last);
		}
		default:
			return false;
	}
}

/**
 * The text of an inverted split: `if (!test)` around the following statements, then the statements of the branch, one
 * level less indented. A single following statement on one line needs no block. Its guard ends in a semicolon, so
 * that the next statement cannot continue it. Returns `null` when the rewrite would drop a comment.
 */
function invertedText(sourceCode: SourceCode, isCaseComparand: CaseComparand, split: Split) {
	const { statement, branch, tail } = split;
	const branchRange = spanOf(branch);
	const tailRange = spanOf(tail);
	const kept = [statement.test.range, branchRange, tailRange];
	if (dropsComment(sourceCode, { range: [statement.range[0], tailRange[1]], kept })) return null;
	const indent = indentation(sourceCode, statement);
	const unit = indentation(sourceCode, assertDefined(branch[0])).slice(indent.length);
	const condition = negatedText(sourceCode, isCaseComparand, statement.test);
	const tailText = reindented(sourceCode, tailRange, line => (line === '' ? line : unit + line));
	const branchText = reindented(sourceCode, branchRange, line =>
		line.startsWith(unit) ? line.slice(unit.length) : line,
	);
	const guard =
		tail.length === 1 && !tailText.includes('\n')
			? `if (${condition}) ${terminated(tailText)}`
			: `if (${condition}) {\n${indent}${unit}${tailText}\n${indent}}`;
	return `${guard}\n${indent}${branchText}`;
}

/**
 * The text of a range whose lines after the first change their indentation with `adjust`. A line that starts inside
 * the text of a template literal keeps it. That text is part of the string.
 */
function reindented(sourceCode: SourceCode, [start, end]: Range, adjust: (line: string) => string) {
	const lines = sourceCode.text.slice(start, end).split('\n');
	let offset = start;
	const adjusted: string[] = [];
	for (const [index, line] of lines.entries()) {
		adjusted.push(index === 0 || isTemplateText(sourceCode, offset) ? line : adjust(line));
		offset += line.length + 1;
	}
	return adjusted.join('\n');
}

/** Whether an offset lies in the text of a template literal rather than in one of its expressions. */
function isTemplateText(sourceCode: SourceCode, offset: number) {
	const node = sourceCode.getNodeByRangeIndex(offset);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a template literal and its text hold the string, so `default` covers the rest.
	switch (node?.type) {
		case 'TemplateElement':
		case 'TemplateLiteral':
			return true;
		default:
			return false;
	}
}

/** The range from the start of the first to the end of the last of some statements. */
function spanOf(statements: readonly ESTree.Statement[]) {
	const {
		range: [start],
	} = assertDefined(statements[0]);
	const {
		range: [, end],
	} = assertDefined(statements.at(-1));
	return [start, end] satisfies Range;
}

/** The text of a statement with a semicolon at its end, unless it ends in one or in a block. */
function terminated(text: string) {
	return text.endsWith(';') || text.endsWith('}') ? text : `${text};`;
}
