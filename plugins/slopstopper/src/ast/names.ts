/** Matches a name that a destructuring can spell out: an ASCII identifier. */
export const BINDABLE_NAME_REGEX = /^[$A-Z_a-z][\w$]*$/u;

/** Whether a name is a reserved word, which a member can read but a shorthand destructuring cannot bind. */
export function isReservedWord(name: string) {
	switch (name) {
		case 'arguments':
		case 'await':
		case 'break':
		case 'case':
		case 'catch':
		case 'class':
		case 'const':
		case 'continue':
		case 'debugger':
		case 'default':
		case 'delete':
		case 'do':
		case 'else':
		case 'enum':
		case 'eval':
		case 'export':
		case 'extends':
		case 'false':
		case 'finally':
		case 'for':
		case 'function':
		case 'if':
		case 'implements':
		case 'import':
		case 'in':
		case 'instanceof':
		case 'interface':
		case 'let':
		case 'new':
		case 'null':
		case 'package':
		case 'private':
		case 'protected':
		case 'public':
		case 'return':
		case 'static':
		case 'super':
		case 'switch':
		case 'this':
		case 'throw':
		case 'true':
		case 'try':
		case 'typeof':
		case 'var':
		case 'void':
		case 'while':
		case 'with':
		case 'yield':
			return true;
		default:
			return false;
	}
}
