#!/bin/bash

# All deployments (preview + production) are handled by GitHub Actions.
# This script tells Vercel's automatic Git integration to skip every build.
# See .github/workflows/preview.yaml and .github/workflows/production.yaml.
echo "Build handled by GitHub Actions. Skipping Vercel automatic build."
exit 0