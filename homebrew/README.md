# Homebrew Tap for Matrix

This is the Homebrew tap for installing [Matrix](https://github.com/ojowwalker77/Claude-Matrix), a persistent memory system for Claude Code.

## Installation

```bash
# Add the tap
brew tap ojowwalker77/matrix

# Install Matrix
brew install matrix

# Complete setup
matrix init
```

## Upgrade

```bash
brew upgrade matrix
```

## Uninstall

```bash
brew uninstall matrix
brew untap ojowwalker77/matrix
```

## Publishing Updates

When releasing a new version:

1. Tag the release in the main repo:
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```

2. Get the SHA256 of the tarball:
   ```bash
   curl -sL https://github.com/ojowwalker77/Claude-Matrix/archive/refs/tags/v0.3.0.tar.gz | shasum -a 256
   ```

3. Update the formula:
   - Update `url` with new tag
   - Update `sha256` with new checksum
   - Commit and push to homebrew-matrix repo

## Development

To test the formula locally:

```bash
brew install --build-from-source ./Formula/matrix.rb
```

## Tap Repository Structure

To publish this formula, create a separate repository named `homebrew-matrix` under `ojowwalker77` with:

```
homebrew-matrix/
├── Formula/
│   └── matrix.rb
└── README.md
```
