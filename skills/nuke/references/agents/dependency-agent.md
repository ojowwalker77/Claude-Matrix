# Dependency Agent

Analyzes npm packages for unused dependencies and overengineered libraries.

## Responsibilities

1. Unused npm packages (in package.json but never imported)
2. Overengineered dependencies (replaceable with native APIs)

## Process

### Step 1: Read package.json

```
Read({ file_path: "package.json" })
```

Extract:
- `dependencies` - production deps
- `devDependencies` - dev deps
- `peerDependencies` - peer deps (never flag these)
- `scripts` - for CLI tool detection

### Step 2: Check Each Dependency

For each package in `dependencies` and `devDependencies`:

```
Grep({ pattern: "from ['\"]<package>", glob: "*.{ts,tsx,js,jsx,mjs}" })
```

Also check for:
- `require('<package>')` - CommonJS imports
- `import('<package>')` - Dynamic imports

### Step 3: Check Non-Import Usage

Some packages are used without being imported:

**Config file usage** - Check these files for the package name:
- `webpack.config.*`, `rollup.config.*`, `vite.config.*`
- `babel.config.*`, `.babelrc`
- `jest.config.*`, `vitest.config.*`
- `tsconfig.json` (paths, plugins)
- `.eslintrc.*`, `eslint.config.*`
- `postcss.config.*`, `tailwind.config.*`

**npm scripts usage** - Check `scripts` in package.json:
```json
"scripts": {
  "lint": "eslint .",          // eslint is used
  "test": "vitest",            // vitest is used
  "build": "tsc && vite build" // typescript, vite used
}
```

**Type packages** - `@types/*` packages are used implicitly by TypeScript. Check if the corresponding package is installed:
- `@types/node` -> always needed in Node projects
- `@types/react` -> needed if `react` is a dependency

### Step 4: Overengineered Dependency Detection

For packages that ARE imported, check if they're overengineered:

**Count usage points:**
```
Grep({ pattern: "from ['\"]<package>['\"/]", output_mode: "count" })
```

**Flag if:**
- Only 1-2 import sites AND the usage could be replaced with native code
- The package is a known "replaceable" library

**Known replaceable patterns:**

| Package | Usage | Native Alternative |
|---------|-------|--------------------|
| `lodash` / `lodash.*` | `_.get(obj, 'a.b.c')` | `obj?.a?.b?.c` |
| `lodash` | `_.isEqual(a, b)` | `JSON.stringify(a) === JSON.stringify(b)` or `structuredClone` |
| `lodash` | `_.debounce` | Simple function (5 lines) |
| `lodash` | `_.cloneDeep` | `structuredClone()` |
| `moment` / `moment-timezone` | Date formatting | `Intl.DateTimeFormat`, `Date.toLocaleString()` |
| `axios` | HTTP requests | `fetch()` (native) |
| `node-fetch` | HTTP in Node | `fetch()` (native since Node 18) |
| `uuid` | UUID generation | `crypto.randomUUID()` |
| `chalk` | Terminal colors | Node 22+ `styleText` or template literals |
| `dotenv` | Env vars | `--env-file` flag (Node 20+), Bun native |
| `glob` | File matching | `fs.glob()` (Node 22+), Bun `Glob` |
| `rimraf` | rm -rf | `fs.rm(path, { recursive: true })` |
| `mkdirp` | mkdir -p | `fs.mkdir(path, { recursive: true })` |
| `is-odd` / `is-even` | Number check | `n % 2 !== 0` |
| `left-pad` | String padding | `String.padStart()` |

**For uncertain cases**, use Context7 to check the library's API:
```
resolve-library-id({ libraryName: "<package>", query: "API surface and alternatives" })
query-docs({ libraryId: "<id>", query: "common usage patterns and native alternatives" })
```

## Output Format

```json
{
  "unusedPackages": [
    {
      "package": "moment",
      "type": "dependency",
      "reason": "No imports found in any source file",
      "confidence": 85
    }
  ],
  "overengineeredDeps": [
    {
      "package": "lodash",
      "usageCount": 1,
      "usedFunctions": ["_.get"],
      "alternative": "Optional chaining (?.) - native JavaScript",
      "confidence": 80
    }
  ]
}
```

## Confidence Modifiers

**Unused packages:**
- Base: 75%
- +15 if never imported anywhere
- -30 if found in config files
- -20 if it's a peer dependency
- -10 if it's a devDependency (build tools may not be imported)
- -25 if used in npm scripts only

**Overengineered deps:**
- Base: 70%
- +10 if only 1 usage site
- +10 if native alternative is well-established (fetch, optional chaining)
- -15 if the library provides significant additional features beyond what's used
- -20 if migration would require changes in >5 files
