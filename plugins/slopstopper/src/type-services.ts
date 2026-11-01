import type { ESTree, SourceCode } from '@oxlint/plugins';

/** An opaque handle to a TypeScript AST node. */
interface Node {
	readonly kind: number;
}

/** TypeScript's representation of a bigint literal's value. */
interface PseudoBigInt {
	readonly negative: boolean;
	readonly base10Value: string;
}

/** An opaque handle to a TypeScript source file. */
interface SourceFile {
	readonly fileName: string;
}

/** A TypeScript node that may have a name, such as the interface that declares a method. */
interface NamedNode {
	/** The name of a declaration; absent on unnamed nodes. Its `text` is absent when the name is no identifier. */
	readonly name?: { readonly text?: string };
}

/** A TypeScript node that declares a symbol, with the node that holds it and its source file. */
interface Declaration {
	readonly parent: NamedNode;
	readonly getSourceFile: () => SourceFile;
}

/** An opaque handle to a TypeScript symbol, such as a property of a type. */
interface TypeSymbol {
	readonly name: string;
	readonly getDeclarations: () => readonly Declaration[] | undefined;
}

/** The members of TypeScript's `Type` that the rules read. Every other member stays opaque. */
export interface Type {
	/** The member types of a union or an intersection; absent on other types. */
	readonly types?: readonly Type[];
	/** The value of a literal type; absent on other types. */
	readonly value?: string | number | PseudoBigInt;
	readonly isUnion: () => boolean;
	readonly isIntersection: () => boolean;
}

/** The members of TypeScript's `TypeChecker` that the rules call, all public in the TypeScript API. */
export interface TypeChecker {
	readonly getTypeAtLocation: (node: Node) => Type;
	readonly isTypeAssignableTo: (source: Type, target: Type) => boolean;
	readonly getPropertyOfType: (type: Type, name: string) => TypeSymbol | undefined;
	readonly getSymbolAtLocation: (node: Node) => TypeSymbol | undefined;
	readonly getStringType: () => Type;
	readonly getNumberType: () => Type;
	readonly getBooleanType: () => Type;
	readonly getBigIntType: () => Type;
	readonly getESSymbolType: () => Type;
	readonly getNullType: () => Type;
	readonly getUndefinedType: () => Type;
	readonly getUnknownType: () => Type;
	readonly getNeverType: () => Type;
}

/** The map from the ESTree nodes of the file to their TypeScript nodes, which typescript-eslint provides. */
interface NodeMap {
	readonly get: (node: ESTree.Node) => Node | undefined;
}

/** The members of TypeScript's `Program` that the rules call, all public in the TypeScript API. */
interface Program {
	readonly getTypeChecker: () => TypeChecker;
	readonly isSourceFileDefaultLibrary: (file: SourceFile) => boolean;
}

/** The members of typescript-eslint's `parserServices` that resolve ESTree nodes to TypeScript types. */
interface ParserServices {
	readonly program: Program;
	readonly esTreeNodeToTSNodeMap: NodeMap;
}

/** The linted program, its type checker, and the map from ESTree nodes to TypeScript nodes. */
export interface TypeServices {
	readonly program: Program;
	readonly checker: TypeChecker;
	readonly nodeMap: NodeMap;
}

/**
 * The type services of the file when the linter provides TypeScript's program (typescript-eslint's `parserServices`),
 * otherwise `null`. Oxlint's JS plugins and ESLint without a TypeScript project provide none. Call it once per file.
 */
export function typeServicesOf({ parserServices }: SourceCode) {
	const { program, esTreeNodeToTSNodeMap } = parserServices;
	if (
		typeof program === 'object' &&
		program !== null &&
		'getTypeChecker' in program &&
		typeof program.getTypeChecker === 'function' &&
		typeof esTreeNodeToTSNodeMap === 'object' &&
		esTreeNodeToTSNodeMap !== null &&
		'get' in esTreeNodeToTSNodeMap &&
		typeof esTreeNodeToTSNodeMap.get === 'function'
	) {
		// The checks confirm only the two entry points. The plugin declares the rest of their API itself so that it
		// imports neither `typescript` nor `@typescript-eslint/utils`, and trusts typescript-eslint to provide it as declared.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Oxlint types `parserServices` as an untyped record.
		const { program: typedProgram, esTreeNodeToTSNodeMap: nodeMap } = {
			program,
			esTreeNodeToTSNodeMap,
		} as ParserServices;
		return { program: typedProgram, checker: typedProgram.getTypeChecker(), nodeMap };
	}
	return null;
}

/**
 * Whether a type is `never` or a top type such as `any` or `unknown`. Only `never` is assignable to `never`, and only
 * top types accept `unknown`, so these assignability checks tell them apart without TypeScript's `TypeFlags`.
 */
export function isNeverOrTopType(checker: TypeChecker, type: Type) {
	return (
		checker.isTypeAssignableTo(type, checker.getNeverType()) ||
		checker.isTypeAssignableTo(checker.getUnknownType(), type)
	);
}

/** The type of an ESTree node, or `null` when the node has no TypeScript counterpart. */
export function typeAtLocation({ nodeMap, checker }: TypeServices, node: ESTree.Node) {
	const tsNode = nodeMap.get(node);
	return typeof tsNode === 'undefined' ? null : checker.getTypeAtLocation(tsNode);
}

/** The symbol that an ESTree node names, or `null` when the node has no TypeScript counterpart or names no symbol. */
export function symbolAtLocation({ nodeMap, checker }: TypeServices, node: ESTree.Node) {
	const tsNode = nodeMap.get(node);
	return typeof tsNode === 'undefined' ? null : (checker.getSymbolAtLocation(tsNode) ?? null);
}
