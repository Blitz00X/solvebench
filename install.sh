#!/usr/bin/env bash
# User-local Linux alpha installer. No sudo or global package changes.
set -euo pipefail
version=v0.1.0-alpha.2
prefix=${SOLVEBENCH_PREFIX:-"$HOME/.local"}
source_dir=
repo=
usage() {
  cat <<'HELP'
Usage: bash install.sh (--repo OWNER/NAME | --source DIR) [--version TAG] [--prefix DIR]

Installs a pinned release in ~/.local/share/solvebench/releases and a launcher
in ~/.local/bin. --source installs an offline source checkout (dependencies still
require Bun's cache or network). --prefix or SOLVEBENCH_PREFIX overrides ~/.local.
Bun must already be installed: see https://bun.sh/docs/installation.
Existing workspaces and configuration are preserved. Failed installs keep the
previous release. An interrupted process may leave .install-lock; remove that
empty directory only after verifying no other installer is running.
HELP
}
die() { printf 'solvebench installer: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Required tool '$1' is missing. Install it and rerun this installer."; }
while (($#)); do
  case "$1" in
    --source|--repo|--version|--prefix)
      (($# >= 2)) || die "Missing value for $1"
      case "$1" in
        --source) source_dir=$2 ;; --repo) repo=$2 ;; --version) version=$2 ;; --prefix) prefix=$2 ;;
      esac
      shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done
[[ $(uname -s) == Linux ]] || die 'This alpha installer supports Linux only.'
[[ -n "$source_dir" && -z "$repo" || -z "$source_dir" && -n "$repo" ]] || die 'Choose exactly one of --repo OWNER/NAME or --source DIR.'
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || die 'Use an explicit version tag such as v0.1.0-alpha.1.'
[[ -z "$repo" || "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die '--repo must be OWNER/NAME.'
for tool in tar mkdir mktemp readlink dirname mv ln rm chmod; do need "$tool"; done
bun_binary=${WORKBENCH_BUN:-$(command -v bun || true)}
if [[ -z "$bun_binary" && -x "$HOME/.bun/bin/bun" ]]; then bun_binary="$HOME/.bun/bin/bun"; fi
[[ -n "$bun_binary" && -x "$bun_binary" ]] || die 'Bun is required. Install Bun from https://bun.sh/docs/installation, then rerun. No system packages were changed.'
# Resolve relative paths before changing into a release directory.
bun_binary=$(readlink -f -- "$bun_binary")
[[ -n "$prefix" ]] || die '--prefix cannot be empty.'
mkdir -p -- "$prefix"
prefix=$(cd -- "$prefix" && pwd -P)
base="$prefix/share/solvebench"
launcher="$prefix/bin/solvebench"
launcher_target="$base/current/bin/solvebench"
for path in "$prefix/share" "$base" "$base/releases" "$base/workspace" "$prefix/bin"; do
  [[ ! -L "$path" ]] || die "Refusing symlink directory: $path"
  [[ ! -e "$path" || -d "$path" ]] || die "Expected directory: $path"
done
mkdir -p -- "$base/releases" "$prefix/bin"
# Never overwrite a file or a symlink owned by another application.
if [[ -e "$launcher" || -L "$launcher" ]]; then
  [[ -L "$launcher" && $(readlink -- "$launcher") == "$launcher_target" ]] || die "Refusing unrelated launcher: $launcher"
fi
if [[ -e "$base/current" || -L "$base/current" ]]; then
  [[ -L "$base/current" ]] || die "Refusing unrelated current path: $base/current"
  current_target=$(readlink -- "$base/current")
  [[ "$current_target" == "$base/releases/"* && "$current_target" != *'/../'* ]] || die 'Current symlink does not point to a managed release.'
fi
lock="$base/.install-lock"
mkdir -- "$lock" 2>/dev/null || die "Another install may be running ($lock). See --help for interrupted installs."
stage=
release=
current_tmp=
launcher_tmp=
created_launcher=false
cleanup() {
  status=$?
  trap - EXIT
  [[ -z "$stage" ]] || rm -rf -- "$stage"
  # Inspect the actual switch, so a signal immediately after rename cannot
  # delete the release current now points at.
  if [[ -n "$release" && $(readlink -- "$base/current" 2>/dev/null || true) != "$release" ]]; then
    rm -rf -- "$release"
    if [[ "$created_launcher" == true && -L "$launcher" && $(readlink -- "$launcher") == "$launcher_target" ]]; then
      rm -f -- "$launcher"
    fi
  fi
  [[ -z "$current_tmp" ]] || rm -f -- "$current_tmp"
  [[ -z "$launcher_tmp" ]] || rm -f -- "$launcher_tmp"
  rmdir -- "$lock" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
stage=$(mktemp -d "$base/releases/.staging-XXXXXXXX")
if [[ -n "$source_dir" ]]; then
  [[ -d "$source_dir" ]] || die "Source directory not found: $source_dir"
  source_dir=$(cd -- "$source_dir" && pwd -P)
  [[ "$base/" != "$source_dir/"* ]] || die 'Install prefix must be outside the source directory.'
  (cd -- "$source_dir" && tar --exclude=.git --exclude=node_modules \
    --exclude=.solvebench --exclude=.pairharness --exclude=exercises --exclude=.exercism-cli \
    --exclude=.goal --exclude=.scratch --exclude=.env --exclude='.env.*' \
    --exclude=solvebench.config.json --exclude=pairharness.config.json -cf - .) | tar -xf - -C "$stage"
  if [[ -f "$source_dir/.env.example" && ! -L "$source_dir/.env.example" ]]; then
    (cd -- "$source_dir" && tar -cf - .env.example) | tar -xf - -C "$stage"
  fi
else
  need curl
  archive="$stage/source.tar.gz"
  printf 'Downloading %s at %s\n' "$repo" "$version"
  curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 "https://github.com/$repo/archive/refs/tags/$version.tar.gz" -o "$archive"
  tar -xzf "$archive" --strip-components=1 -C "$stage"
  rm -- "$archive"
fi
for path in package.json bun.lock bin/pairs bin/solvebench; do
  [[ -f "$stage/$path" && ! -L "$stage/$path" ]] || die "Release is missing a regular file: $path"
done
chmod +x "$stage/bin/pairs" "$stage/bin/solvebench"
printf 'Installing frozen dependencies for %s\n' "$version"
(cd "$stage" && "$bun_binary" install --frozen-lockfile)
smoke=$(cd "$stage" && WORKBENCH_BUN="$bun_binary" bash bin/pairs --version)
[[ "$smoke" == "solvebench ${version#v}" ]] || die "Release version smoke failed (expected solvebench ${version#v})."
# A unique final release means reinstalling the same tag never alters current.
release="$base/releases/${version}-${stage##*.staging-}"
mv -- "$stage" "$release"
stage=
mkdir -p -- "$base/workspace"
current_tmp="$base/.current-${release##*/}"
ln -s -- "$release" "$current_tmp"
# Prepare the launcher before the atomic release switch; its stable target does
# not need rewriting on future updates.
if [[ ! -L "$launcher" ]]; then
  created_launcher=true
  launcher_tmp="$prefix/bin/.solvebench-${release##*/}"
  ln -s -- "$launcher_target" "$launcher_tmp"
  mv -T -- "$launcher_tmp" "$launcher"
  launcher_tmp=
fi
mv -Tf -- "$current_tmp" "$base/current"
current_tmp=
printf 'Installed SolveBench %s\nRun: %s\nWorkspace: %s\n' "${version#v}" "$launcher" "$base/workspace"
case ":$PATH:" in *":$prefix/bin:"*) ;; *) printf 'Add %s to PATH to run solvebench by name.\n' "$prefix/bin" ;; esac
