# Verification Agent

Run project commands (build, test, lint) as final validation phase. Detects project type and available commands automatically.

## Input
- Changed files list
- Remediation suggestions (if any fixes were proposed)

## Output
```typescript
interface VerificationResult {
  projectType: string;           // "typescript" | "python" | "rust" | "go" | etc.
  configFile: string;            // "package.json" | "Cargo.toml" | etc.
  commandsRun: CommandResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

interface CommandResult {
  name: string;        // "build" | "test" | "lint" | "typecheck"
  command: string;     // Actual command executed
  status: "pass" | "fail" | "skip";
  duration: number;    // ms
  output?: string;     // Truncated output on failure
  exitCode?: number;
}
```

---

## Project Detection

Detect project type by checking for config files in order:

```
1. package.json           → TypeScript/JavaScript
2. Cargo.toml            → Rust
3. go.mod                → Go
4. pyproject.toml        → Python (modern)
5. setup.py              → Python (legacy)
6. requirements.txt      → Python (minimal)
7. pom.xml               → Java (Maven)
8. build.gradle(.kts)    → Java/Kotlin (Gradle)
9. Gemfile               → Ruby
10. composer.json        → PHP
11. mix.exs              → Elixir
12. Package.swift        → Swift
13. CMakeLists.txt       → C/C++ (CMake)
14. Makefile             → C/C++ (Make)
```

If multiple found, use first match (priority order above).

---

## Command Extraction

### TypeScript/JavaScript (package.json)

Read `scripts` section. Look for these keys in order:

| Priority | Script Names to Check | Type |
|----------|----------------------|------|
| 1 | `build`, `compile` | build |
| 2 | `typecheck`, `tsc`, `type-check` | typecheck |
| 3 | `test`, `test:unit`, `jest`, `vitest` | test |
| 4 | `lint`, `eslint`, `biome` | lint |

**Execution:**
```bash
npm run <script>
# or if using bun (check for bun.lockb)
bun run <script>
# or if using pnpm (check for pnpm-lock.yaml)
pnpm run <script>
```

### Rust (Cargo.toml)

Standard commands (no config parsing needed):

| Command | Execution |
|---------|-----------|
| build | `cargo build` |
| test | `cargo test` |
| lint | `cargo clippy` (if clippy installed) |

### Go (go.mod)

| Command | Execution |
|---------|-----------|
| build | `go build ./...` |
| test | `go test ./...` |
| lint | `golangci-lint run` (if installed) |

### Python (pyproject.toml / setup.py)

Check `[tool.pytest]` or `[tool.ruff]` sections, otherwise:

| Command | Execution |
|---------|-----------|
| test | `pytest` or `python -m pytest` |
| lint | `ruff check .` or `flake8` |
| typecheck | `mypy .` or `pyright` |

### Java/Kotlin (Maven/Gradle)

**Maven (pom.xml):**
```bash
mvn compile        # build
mvn test           # test
mvn checkstyle:check  # lint (if configured)
```

**Gradle:**
```bash
./gradlew build    # build
./gradlew test     # test
./gradlew lint     # lint (if task exists)
```

### Ruby (Gemfile)

```bash
bundle exec rake   # build (if Rakefile exists)
bundle exec rspec  # test (if spec/ exists)
bundle exec rubocop # lint (if .rubocop.yml exists)
```

### PHP (composer.json)

Read `scripts` section similar to package.json, or:
```bash
composer run-script test
vendor/bin/phpunit  # if phpunit in require-dev
vendor/bin/phpstan  # lint
```

### Elixir (mix.exs)

```bash
mix compile        # build
mix test           # test
mix credo          # lint (if credo in deps)
```

### C/C++ (CMake/Make)

**CMake:**
```bash
cmake --build build    # build
ctest --test-dir build # test
```

**Makefile:**
```bash
make           # build
make test      # test (if target exists)
```

---

## Execution Rules

1. **Run in order:** build → typecheck → test → lint
2. **Continue on failure:** Report error, proceed to next command
3. **Timeout:** 120 seconds per command (configurable)
4. **Skip if not found:** Don't fail if command doesn't exist
5. **Truncate output:** Keep first/last 50 lines on failure

---

## Algorithm

```
1. Detect project type:
   configFile = findFirstExisting([
     "package.json", "Cargo.toml", "go.mod", "pyproject.toml",
     "setup.py", "pom.xml", "build.gradle", "Gemfile", ...
   ])

2. Extract available commands:
   commands = extractCommands(configFile)
   # Returns: [{ name: "build", cmd: "npm run build" }, ...]

3. Execute commands:
   results = []
   for cmd in commands:
     start = now()
     result = Bash(cmd.cmd, timeout=120000)
     results.push({
       name: cmd.name,
       command: cmd.cmd,
       status: result.exitCode === 0 ? "pass" : "fail",
       duration: now() - start,
       output: result.exitCode !== 0 ? truncate(result.output) : null,
       exitCode: result.exitCode
     })

4. Return summary:
   passed = results.filter(r => r.status === "pass").length
   failed = results.filter(r => r.status === "fail").length
   return { projectType, configFile, commandsRun: results, summary: { total, passed, failed } }
```

---

## Output Format (in review)

Add to end of review output:

```markdown
## Verification

| Command | Status | Duration |
|---------|--------|----------|
| build | PASS | 2.3s |
| typecheck | PASS | 1.1s |
| test | FAIL | 8.2s |
| lint | PASS | 0.5s |

### Failed: test
```
npm run test

> jest --coverage

FAIL src/utils/auth.test.ts
  ● AuthService › should validate token
    Expected: true
    Received: false
```

**Summary:** 3/4 passed. Fix test failures before merge.
```

---

## Skip Conditions

Skip verification phase entirely if:
- No recognizable project config found
- `--skip-verify` flag passed
- Lazy mode active
- No code changes (docs-only PR)
