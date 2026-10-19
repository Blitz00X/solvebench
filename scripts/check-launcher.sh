#!/usr/bin/env bash
# A launch failure must fail this check, rather than disappear in a background job.
set -euo pipefail
project_dir="$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")"
python_bin="${WORKBENCH_TEST_PYTHON:-python3}"
exec "$python_bin" "$project_dir/scripts/pty-workbench.py"
