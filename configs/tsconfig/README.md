# `@bastidood/tsconfig`

Strict TypeScript compiler options.

## Installation

```sh
pnpm add --save-dev @bastidood/tsconfig
```

## Configuration

```json
{
	"extends": "@bastidood/tsconfig",
	"include": ["src"],
	"compilerOptions": {
		"lib": ["ESNext"],
		"module": "nodenext",
		"noEmit": true
	}
}
```

## Limitations

- Only strictness flags are shared. Set `lib`, `module`, `moduleResolution`, and emit options yourself.
- The flags are not configurable beyond overriding them in your own `tsconfig.json`.
