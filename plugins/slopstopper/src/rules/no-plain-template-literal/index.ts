import { defineRule, type ESTree } from '@oxlint/plugins';

import { assertDefined, assertSingle } from '#assert.ts';
import { isFunction } from '#ast/functions.ts';
import { messageLabel } from '#ast/labels.ts';

/** Matches a line feed or a carriage return. */
const LINE_BREAK_REGEX = /[\n\r]/u;

/** Matches a placeholder `${…}` with a non-empty body. */
const PLACEHOLDER_REGEX = /\$\{[^}]+\}/u;

/** Matches raw template text that a single-quoted string cannot keep: an escaped backtick, `$`, or `{`, or a `'`. */
const TEMPLATE_ONLY_SPELLING_REGEX = /\\[`${]|'/u;

/** Matches a character that a single-quoted string must escape: a `\`, a `'`, a control character, U+2028, or U+2029. */
const STRING_ESCAPE_REGEX = /[\\'\p{Cc}\u2028\u2029]/gu;

/**
 * Reports an untagged template literal without expressions in favor of a quoted string. A template whose raw text holds
 * a line break reads better as a template, and one whose value spells a placeholder, as in `\${a}`, is left to
 * `no-template-curly-in-string`, which reports that string, so neither is reported. The fix spells the same cooked value as a
 * single-quoted string. A template holds no comments, so the fix drops none. A template that is a whole statement is never
 * fixed, because a quoted string there can become a directive. In a directive prologue, the rule suggests the quoted
 * directive that the template was likely meant to be.
 */
export const NO_PLAIN_TEMPLATE_LITERAL = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		hasSuggestions: true,
		docs: {
			description: 'Prefer a quoted string over a template literal without expressions.',
		},
		messages: {
			noPlainTemplateLiteral:
				'Use the quoted string `{{replacement}}` instead of a template literal without expressions.',
			templateDirective:
				'`` {{template}} `` is never a directive. Write `{{replacement}}` if it is meant as one, or remove it.',
			quoteDirective: 'Write the directive as a quoted string.',
		},
		schema: [],
	},
	create(context) {
		return {
			TemplateLiteral(node) {
				if (node.expressions.length > 0 || isTagged(node)) return;

				const { value } = assertSingle(node.quasis);
				const { cooked, raw } = value;
				if (LINE_BREAK_REGEX.test(raw)) return;
				// An untagged template with an invalid escape is a syntax error, so `cooked` is only `null` defensively.
				if (cooked === null) return;
				// `no-template-curly-in-string` reports a string that spells a placeholder, as an escaped `\${a}` does.
				if (PLACEHOLDER_REGEX.test(cooked)) return;

				const text = quote({ cooked, raw });
				const data = { replacement: messageLabel(text) };
				const { parent } = node;
				if (parent.type !== 'ExpressionStatement') {
					context.report({
						node,
						messageId: 'noPlainTemplateLiteral',
						data,
						fix: fixer => fixer.replaceText(node, text),
					});
					return;
				}

				// A quoted string statement in a directive prologue is a directive, which a template statement is not.
				if (isInPrologue(parent)) {
					context.report({
						node,
						messageId: 'templateDirective',
						data: { ...data, template: messageLabel(context.sourceCode.getText(node)) },
						suggest: [
							{
								messageId: 'quoteDirective',
								fix: fixer => fixer.replaceText(node, text),
							},
						],
					});
					return;
				}

				context.report({ node, messageId: 'noPlainTemplateLiteral', data });
			},
		};
	},
});

function isTagged(node: ESTree.TemplateLiteral) {
	const { parent } = node;
	return parent.type === 'TaggedTemplateExpression' && parent.quasi === node;
}

/**
 * Whether a statement stands in a directive prologue: it heads a script, a module, or a function body, after nothing
 * but directives.
 */
function isInPrologue(statement: ESTree.ExpressionStatement) {
	const body = prologueBody(statement.parent);
	if (body === null) return false;

	for (const sibling of body) {
		if (sibling === statement) return true;
		if (!isDirective(sibling)) return false;
	}
	return false;
}

/** The statements of a node that can open with a directive prologue: a program or a function body. */
function prologueBody(node: ESTree.Node) {
	if (node.type === 'Program') return node.body;
	return node.type === 'BlockStatement' && isFunction(node.parent) ? node.body : null;
}

/** Whether a statement is a directive: a statement of one quoted string. */
function isDirective(statement: ESTree.Node) {
	return (
		statement.type === 'ExpressionStatement' &&
		statement.expression.type === 'Literal' &&
		typeof statement.expression.value === 'string'
	);
}

/** The cooked value of a template with the raw text that spells it. */
interface Spelling {
	cooked: string;
	raw: string;
}

/**
 * The single-quoted string with the cooked value of a template. Template and string escapes match apart from the
 * escaped backtick and the escaped `$` or `{`, so raw text without those escapes and without a `'` keeps its spelling.
 * Otherwise the string escapes the cooked value.
 */
function quote({ cooked, raw }: Spelling) {
	if (TEMPLATE_ONLY_SPELLING_REGEX.test(raw)) {
		return `'${cooked.replaceAll(STRING_ESCAPE_REGEX, escape)}'`;
	}
	return `'${raw}'`;
}

/** The escape sequence of a character inside a single-quoted string. */
function escape(character: string) {
	const short = shortEscape(character);
	if (short !== null) return short;

	const hex = assertDefined(character.codePointAt(0)).toString(16);
	return hex.length > 2 ? `\\u${hex.padStart(4, '0')}` : `\\x${hex.padStart(2, '0')}`;
}

/** The short escape of a character inside a single-quoted string, or `null` when it has none. */
function shortEscape(character: string) {
	switch (character) {
		case '\\':
			return String.raw`\\`;
		case "'":
			return String.raw`\'`;
		case '\b':
			return String.raw`\b`;
		case '\t':
			return String.raw`\t`;
		case '\n':
			return String.raw`\n`;
		case '\v':
			return String.raw`\v`;
		case '\f':
			return String.raw`\f`;
		case '\r':
			return String.raw`\r`;
		default:
			return null;
	}
}
