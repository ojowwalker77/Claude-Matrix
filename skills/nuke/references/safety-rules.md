# Safety Rules

Rules that prevent false positives. Any finding matching these rules is **FILTERED** (never shown).

## Entry Point Detection

These files should **NEVER** be flagged as orphaned or having dead exports:

### Package.json Fields
- `main` field value
- `module` field value
- `exports` field values (all paths)
- `bin` field values
- `files` field values (public API surface)

### File Name Patterns
```
index.ts, index.js, index.tsx, index.jsx, index.mjs
main.ts, main.js, main.mjs
app.ts, app.js, app.tsx, app.jsx
server.ts, server.js, server.mjs
cli.ts, cli.js, cli.mjs
```

### Directory Patterns
```
bin/*
scripts/*
```

### Config Files
```
*.config.ts, *.config.js, *.config.mjs, *.config.cjs
vite.config.*, webpack.config.*, jest.config.*
tsconfig.json, tsconfig.*.json
next.config.*, remix.config.*, astro.config.*
tailwind.config.*, postcss.config.*
```

### Framework Conventions

**Next.js:**
- `pages/**/*`, `app/**/*`
- `middleware.ts`
- `_app.tsx`, `_document.tsx`

**Remix:**
- `routes/**/*`
- `entry.client.tsx`, `entry.server.tsx`

**Astro:**
- `src/pages/**/*`
- `src/content/**/*`

**SvelteKit:**
- `src/routes/**/*`

### Data Files
```
migrations/*, migrate/*
seeds/*, seed/*
fixtures/*
```

## Dynamic Import Detection

Before flagging a symbol or file as dead, check for:

1. **Dynamic imports** - `import('...')` referencing the file/symbol
   ```
   Grep({ pattern: "import\\(['\"].*<filename>" })
   ```

2. **require() calls** - CommonJS dynamic loading
   ```
   Grep({ pattern: "require\\(['\"].*<filename>" })
   ```

3. **Re-exports through barrel files** - `export * from './module'`
   ```
   Grep({ pattern: "export \\* from ['\"].*<filename>" })
   ```

4. **String-based references** - Factory patterns, DI containers
   ```
   Grep({ pattern: "'<symbolName>'|\"<symbolName>\"" })
   ```

5. **Decorator usage** - `@Controller`, `@Injectable`, `@Module` etc.
   Check if the file uses decorators that register it automatically.

## Public API Surface

Never flag exports in:

1. Root `index.ts` / `index.js` barrel files (the main package export)
2. Files directly listed in package.json `exports` map
3. Files with `@public` or `@api` JSDoc tags
4. Files in directories named `public/` or `api/`

## Comment Safety

Never flag these comment types as "unnecessary":

1. **JSDoc blocks** - `/** ... */` with `@param`, `@returns`, `@example` etc.
2. **License headers** - Copyright notices, SPDX identifiers
3. **eslint/prettier directives** - `// eslint-disable-next-line`, `/* prettier-ignore */`
4. **TypeScript directives** - `// @ts-ignore`, `// @ts-expect-error`
5. **Webpack magic comments** - `/* webpackChunkName: ... */`
6. **Explanatory comments with "because"/"why"** - Comments that explain reasoning

## Console.log Safety

Never flag:

1. **`console.error`** - Usually intentional error reporting
2. **`console.warn`** - Usually intentional warnings
3. **Conditional debug** - `if (DEBUG) console.log(...)` or `if (process.env.NODE_ENV === 'development')`
4. **Logger utilities** - Files named `logger.*`, `log.*`, `debug.*`
5. **CLI output** - Files in `bin/`, `cli.*`, `scripts/`

## .nukeignore

If a `.nukeignore` file exists in the project root, honor it:
- Same syntax as `.gitignore`
- Files/patterns listed are completely excluded from analysis
- Takes precedence over all other rules
