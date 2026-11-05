import type { ESTree, Range, SourceCode } from '@oxlint/plugins';

import { assertDefined } from '#assert.ts';
import { alwaysExits, type SwitchBranch, type SwitchDecision } from '#ast/decisions.ts';
import { indentation } from '#ast/layout.ts';
import { splitLeading } from '#ast/logical-operands.ts';
import { dropsComment, isWithin } from '#ast/ranges.ts';

/** Matches a line break that a non-empty line follows. */
const NON_EMPTY_LINE_REGEX = /\n(?!\n)/gu;

/** The `switch` statement that replaces a decision, and the source range that it replaces. */
interface Rewrite {
	range: Range;
	text: string;
}

/**
 * Where the `switch` goes: the indentation of its clauses, and how many levels deeper than the original statements it
 * sits (one when it replaces an `else if` and needs its own block).
 */
interface Layout {
	sourceCode: SourceCode;
	caseIndent: string;
	depth: number;
}

/** The statements of one clause, laid out for the clause, and whether they need a block or always exit. */
interface Body {
	text: string;
	isScoped: boolean;
	exits: boolean;
}

/** One clause of the `switch`: its labels, its body, and whether it is the last clause, which needs no `break`. */
interface Clause {
	labels: readonly string[];
	body: Body;
	isLast: boolean;
}

/** The source ranges whose text moves into the `switch`. A comment outside them would be dropped. */
type Kept = Range[];

/**
 * The `switch` statement that replaces a decision, or `null` when no rewrite exists: the decision starts at an `else
 * if` and continues past its chain, a trailing guard's or a case's rest of the test is parenthesized, a comment would be
 * dropped, or code after a trailing guard declares a name that code outside it reads. Expects no final `else` after a
 * case with an extra condition.
 *
 * Every member's consequent becomes the body of its cases, one stacked case per `||` alternative. A member
 * `if (x === A && <rest>) <consequent>` becomes case `A` with the body `if (<rest>) <consequent>`. The last case's
 * `else` becomes `default`, and so does the consequent of a complement. A trailing guard `if (x !== A || <rest>)`
 * adds case `A`, whose body is `if (<rest>) <exit>` followed by every later statement of the list, and its exit becomes
 * `default`. A body that always exits gets no `break`.
 */
export function switchRewrite(sourceCode: SourceCode, decision: SwitchDecision) {
	const { head, statements, firstIndex, lastIndex, ending } = decision;
	const isElseIf = head.parent.type === 'IfStatement' && head.parent.alternate === head;
	const top = assertDefined(statements[firstIndex]);
	const { range: lastRange } = assertDefined(
		ending.kind === 'guard' ? statements.at(-1) : statements[lastIndex],
	);
	if (isElseIf && lastIndex !== firstIndex) return null;

	const indent = indentation(sourceCode, isElseIf ? head : top);
	const layout = {
		sourceCode,
		caseIndent: `${indent}\t${isElseIf ? '\t' : ''}`,
		depth: isElseIf ? 1 : 0,
	};

	const kept: Kept = [];
	let text = `switch (${sourceCode.getText(decision.discriminant)}) {`;
	const { branches } = decision;
	for (const [index, branch] of branches.entries()) {
		const labels = branch.comparands.map(comparand => `case ${sourceCode.getText(comparand)}:`);
		const isLast = ending.kind === 'open' && index === branches.length - 1;
		const body = caseBody(layout, branch, kept);
		if (body === null) return null;
		text += clause(layout, { labels, body, isLast });
	}

	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- An open decision has no `default`, so `default` covers it.
	switch (ending.kind) {
		case 'else':
		case 'complement':
			text += clause(layout, {
				labels: ['default:'],
				body: bodyOf(
					layout,
					ending.kind === 'else' ? ending.alternate : ending.complement.consequent,
					kept,
				),
				isLast: true,
			});
			break;
		case 'guard': {
			const body = guardedBody(layout, { decision, guard: ending.guard, kept });
			if (body === null) return null;
			text += clause(layout, {
				labels: [`case ${sourceCode.getText(ending.comparand)}:`],
				body,
				isLast: false,
			});
			text += clause(layout, {
				labels: ['default:'],
				body: bodyOf(layout, ending.guard.consequent, kept),
				isLast: true,
			});
			break;
		}
		default:
			break;
	}

	const range = [isElseIf ? head.range[0] : top.range[0], lastRange[1]] satisfies Range;
	if (dropsComment(sourceCode, { range, kept })) return null;

	const baseIndent = indent + (isElseIf ? '\t' : '');
	text += `\n${baseIndent}}`;
	return {
		range,
		text: isElseIf ? `{\n${baseIndent}${text}\n${indent}}` : text,
	} satisfies Rewrite;
}

/** The text of one clause: its labels, its body, and a `break` unless the body always exits or the clause is the last one. */
function clause({ caseIndent }: Layout, { labels, body, isLast }: Clause) {
	let text = '';
	for (const label of labels) text += `\n${caseIndent}${label}`;
	if (body.isScoped) text += ' {';
	if (body.text !== '') text += `\n${caseIndent}\t${body.text}`;
	if (!isLast && !body.exits) text += `\n${caseIndent}\tbreak;`;
	if (body.isScoped) text += `\n${caseIndent}}`;
	return text;
}

/**
 * The body of a case: the member's consequent, as `if (<rest>) <consequent>` when the test is `x === A && <rest>`.
 * Returns `null` when parentheses group the case comparison with the rest.
 */
function caseBody(layout: Layout, { member, condition }: SwitchBranch, kept: Kept) {
	const { consequent } = member;
	if (condition === null) return bodyOf(layout, consequent, kept);

	const { sourceCode, depth } = layout;
	const rest = splitLeading(sourceCode, condition);
	if (rest === null) return null;
	kept.push([rest.start, condition.range[1]], consequent.range);
	const test = indented(rest.text, depth + 2);
	const body = indented(sourceCode.getText(consequent), depth + 2);
	return { text: `if (${test}) ${body}`, isScoped: false, exits: false };
}

/**
 * A consequent or an `else` alternate as a clause body: the statements of a block without its braces, or the statement
 * itself. Records the text that moves into the `switch` in `kept`.
 */
function bodyOf({ sourceCode, depth }: Layout, statement: ESTree.Statement, kept: Kept) {
	const { text } = sourceCode;
	const exits = alwaysExits(statement);

	if (statement.type === 'BlockStatement') {
		const [start, end] = statement.range;
		kept.push([start + 1, end - 1]);
		return {
			text: indented(text.slice(start + 1, end - 1).trim(), depth + 1),
			isScoped: statement.body.some(isScopedDeclaration),
			exits,
		};
	}

	kept.push(statement.range);
	return {
		text: indented(text.slice(...statement.range), depth + 2),
		isScoped: isScopedDeclaration(statement),
		exits,
	};
}

/** The trailing guard of a decision, and the source ranges that move into the `switch`. */
interface Guarded {
	decision: SwitchDecision;
	guard: ESTree.IfStatement;
	kept: Kept;
}

/**
 * The body of the case that a trailing guard adds: `if (<rest>) <exit>` when the guard's test has further `||`
 * alternatives, followed by every later statement of the list. Returns `null` when the first alternative is grouped
 * with the rest by parentheses, or when a later statement is a module declaration or declares a name that code
 * outside the later statements reads.
 */
function guardedBody(layout: Layout, { decision, guard, kept }: Guarded) {
	const { sourceCode } = layout;
	const { statements, lastIndex } = decision;
	let text = '';
	const { test } = guard;
	if (test.type === 'LogicalExpression' && test.operator === '||') {
		const rest = splitLeading(sourceCode, test);
		if (rest === null) return null;
		kept.push([rest.start, test.range[1]], guard.consequent.range);
		text = `if (${rest.text}) ${indented(sourceCode.getText(guard.consequent), 2)}`;
	}

	const first = statements[lastIndex + 1];
	let exits = false;
	let isScoped = false;
	if (typeof first !== 'undefined') {
		const last = assertDefined(statements.at(-1));
		const range = [first.range[0], last.range[1]] satisfies Range;
		for (let index = lastIndex + 1; index < statements.length; ++index) {
			const statement = assertDefined(statements[index]);
			if (!isConfined(sourceCode, { statement, range })) return null;
			isScoped ||= isScopedDeclaration(statement);
		}

		kept.push(range);
		if (text !== '') text += `\n${layout.caseIndent}\t`;
		text += indented(sourceCode.text.slice(...range), 2);
		exits = alwaysExits(last);
	}

	return { text, isScoped, exits };
}

/** A later statement of a trailing guard's list, and the range of the later statements that move with it. */
interface Moved {
	statement: ESTree.Directive | ESTree.Statement;
	range: Range;
}

/** Whether a statement can move into a `switch` case: it is no module declaration, and every name it declares is read only within the moved range. */
function isConfined(sourceCode: SourceCode, { statement, range }: Moved) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only module declarations cannot move into a block, so `default` covers the rest.
	switch (statement.type) {
		case 'ImportDeclaration':
		case 'ExportNamedDeclaration':
		case 'ExportDefaultDeclaration':
		case 'ExportAllDeclaration':
		case 'TSExportAssignment':
		case 'TSImportEqualsDeclaration':
		case 'TSNamespaceExportDeclaration':
			return false;
		default:
			break;
	}

	return sourceCode
		.getDeclaredVariables(statement)
		.every(({ references }) =>
			references.every(({ identifier }) => isWithin(identifier.range, range)),
		);
}

/** Whether a statement declares a block-scoped name, which needs a block in a `switch` case. */
function isScopedDeclaration(statement: ESTree.Directive | ESTree.Statement) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only declarations matter, so `default` covers the rest.
	switch (statement.type) {
		case 'VariableDeclaration':
			return statement.kind !== 'var';
		case 'ClassDeclaration':
		case 'FunctionDeclaration':
		case 'TSEnumDeclaration':
		case 'TSInterfaceDeclaration':
		case 'TSTypeAliasDeclaration':
		case 'TSModuleDeclaration':
			return true;
		default:
			return false;
	}
}

/** Text moved `depth` levels deeper: every line after the first gets that many more tabs, except empty lines. */
function indented(text: string, depth: number) {
	return text.replaceAll(NON_EMPTY_LINE_REGEX, `\n${'\t'.repeat(depth)}`);
}
