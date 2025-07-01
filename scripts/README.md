# Release Process

This directory contains scripts for managing releases of the Zenobia Pay UI components.

## Release Script (`release.js`)

The release script automates the entire release process:

1. **Versioning**: Uses changesets to bump version numbers
2. **Building**: Builds all packages (main, zenobia, modal)
3. **Publishing**: Publishes to npm
4. **Deployment**: Deploys built files to the landing page repository

### Usage

```bash
npm run release
```

### What it does

1. Runs `changeset version` to update version numbers
2. Commits version changes
3. Builds all packages:
   - Main package (`npm run build`)
   - Zenobia bundle (`npm run build:zenobia`)
   - Modal bundle (`npm run build:modal`)
4. Pushes changes and tags to current repository
5. Publishes to npm
6. Clones the landing page repository
7. Copies built files to `public/version/{version}/` directory
8. Commits and pushes to landing page repository
9. Cleans up temporary files

## CI/CD Integration

The release process is also automated via GitHub Actions (`.github/workflows/release.yml`):

- Triggers when changesets are pushed to main branch
- Automatically creates release PRs or publishes releases
- Deploys to landing page repository
- Requires the following secrets:
  - `NPM_TOKEN`: For publishing to npm
  - `LANDING_PAGE_TOKEN`: For accessing the landing page repository

## Required Secrets

To use the CI/CD pipeline, you need to set up these repository secrets:

1. **NPM_TOKEN**: Your npm authentication token
2. **LANDING_PAGE_TOKEN**: A GitHub personal access token with write access to the landing page repository

## Manual Release

If you need to run a release manually:

```bash
# Make sure you have the required tokens set up
export NPM_TOKEN=your_npm_token
export LANDING_PAGE_TOKEN=your_github_token

# Run the release
npm run release
```

## File Structure

After a release, the landing page repository will have this structure:

```
public/
  version/
    0.0.33/
      zenobia-pay.js
      zenobia-pay-modal.js
    0.0.34/
      zenobia-pay.js
      zenobia-pay-modal.js
    ...
```
