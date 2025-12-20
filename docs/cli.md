# CLI Reference

Full command-line interface for Matrix.

## Commands

### search

Search for solutions semantically.

```bash
matrix search <query> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--limit=N` | 5 | Max results |
| `--min-score=N` | 0.3 | Minimum similarity (0-1) |
| `--scope=` | all | Filter: `all`, `repo`, `stack`, `global` |

**Examples:**

```bash
matrix search "OAuth implementation"
matrix search "database connection pooling" --limit=10
matrix search "React hooks" --scope=stack --min-score=0.5
```

---

### list

List stored data with pagination.

```bash
matrix list [type] [options]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `type` | solutions | `solutions`, `failures`, or `repos` |

| Option | Default | Description |
|--------|---------|-------------|
| `--page=N` | 1 | Page number |
| `--limit=N` | 20 | Results per page |

**Examples:**

```bash
matrix list solutions
matrix list failures --page=2
matrix list repos --limit=50
```

---

### stats

Show memory statistics and current repo info.

```bash
matrix stats
```

---

### export

Export database to JSON or CSV.

```bash
matrix export [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--format=` | json | `json` or `csv` |
| `--output=FILE` | stdout | Output file path |
| `--type=` | all | `all`, `solutions`, `failures`, `repos` |

**Examples:**

```bash
matrix export --format=json --output=backup.json
matrix export --format=csv --type=solutions --output=solutions.csv
```

> Note: CSV requires `--type` to be set (not `all`)

---

### init

Setup wizard for new installations.

```bash
matrix init [options]
```

| Option | Description |
|--------|-------------|
| `--force` | Continue despite errors |
| `--skip-mcp` | Skip MCP server registration |
| `--skip-claude-md` | Skip CLAUDE.md setup |

---

### version

Show version.

```bash
matrix version
```

---

### help

Show usage info.

```bash
matrix help
```
