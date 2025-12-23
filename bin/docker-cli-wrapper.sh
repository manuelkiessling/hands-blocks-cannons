#!/usr/bin/env bash
set -euo pipefail

# Docker CLI wrapper for Hands, Blocks & Cannons game sessions
# This script restricts Docker commands to only those needed for game session management.
#
# Security features:
# - Only allows specific Docker subcommands (run, stop, rm, ps, inspect)
# - Container names must match pattern: hbc-session-[a-z0-9]+
# - Only allows the hbc-game-session image for 'run' command
#
# Usage via sudoers (see README.md):
#   www-data ALL=(root) NOPASSWD: /path/to/docker-cli-wrapper.sh *

# Allowed subcommands
ALLOWED_CMDS=("run" "stop" "rm" "ps" "inspect")

# Container name pattern (hbc-session- followed by alphanumeric session ID)
CONTAINER_RE='^hbc-session-[a-z0-9]+$'

# Allowed image name for 'run' command
ALLOWED_IMAGE="hbc-game-session"

# Docker binary
DOCKER_BIN="${DOCKER_BIN:-/usr/bin/docker}"

# Validation mode for testing
do_exec() {
  if [[ "${HBC_WRAPPER_VALIDATE_ONLY:-}" == "1" ]]; then
    printf '%s' "${DOCKER_BIN}"
    for arg in "$@"; do
      printf ' %q' "${arg}"
    done
    echo
    exit 0
  fi
  exec "${DOCKER_BIN}" "$@"
}

# Get the command
cmd="${1:-}"
shift || true

# Validate command is allowed
case " ${ALLOWED_CMDS[*]} " in
  *" ${cmd} "*)
    ;;
  *)
    echo "Denied: command '${cmd}' not allowed" >&2
    exit 1
    ;;
esac

# Handle commands that don't require container name validation
if [[ "${cmd}" == "ps" ]]; then
  # Restrict ps to only show hbc-session containers
  do_exec ps --filter "name=^hbc-session-" --format '{{.Names}} {{.Status}}'
fi

# Handle 'run' command specially
if [[ "${cmd}" == "run" ]]; then
  args=("$@")
  container_name=""
  image_name=""
  
  # Find container name from --name parameter
  for i in "${!args[@]}"; do
    if [[ "${args[$i]}" == "--name" ]] && [[ $((i+1)) -lt ${#args[@]} ]]; then
      container_name="${args[$((i+1))]}"
      break
    fi
  done
  
  # Validate container name
  if [[ -z "${container_name}" ]] || [[ ! "${container_name}" =~ ${CONTAINER_RE} ]]; then
    echo "Denied: invalid or missing container name (must match hbc-session-*)" >&2
    exit 1
  fi
  
  # Find image name (last non-flag argument)
  for (( i=${#args[@]}-1; i>=0; i-- )); do
    arg="${args[$i]}"
    if [[ ! "${arg}" =~ ^- ]] && [[ -n "${arg}" ]]; then
      image_name="${arg}"
      break
    fi
  done
  
  # Validate image name
  if [[ -z "${image_name}" ]] || [[ "${image_name}" == -* ]]; then
    echo "Denied: invalid image name" >&2
    exit 1
  fi
  
  if [[ "${image_name}" != "${ALLOWED_IMAGE}" ]]; then
    echo "Denied: only '${ALLOWED_IMAGE}' image is allowed" >&2
    exit 1
  fi
  
  do_exec run "$@"
fi

# Handle 'inspect' command
if [[ "${cmd}" == "inspect" ]]; then
  args=("$@")
  container_name=""
  
  # Find container name (last non-flag argument)
  for (( i=${#args[@]}-1; i>=0; i-- )); do
    arg="${args[$i]}"
    if [[ ! "${arg}" =~ ^- ]] && [[ -n "${arg}" ]]; then
      container_name="${arg}"
      break
    fi
  done
  
  if [[ -z "${container_name}" ]] || [[ ! "${container_name}" =~ ${CONTAINER_RE} ]]; then
    echo "Denied: invalid or missing container name for inspect" >&2
    exit 1
  fi
  
  do_exec inspect "$@"
fi

# Handle 'stop' and 'rm' commands (require container name as first arg)
if [[ "${cmd}" == "stop" ]] || [[ "${cmd}" == "rm" ]]; then
  name="${1:-}"
  shift || true
  
  if [[ -z "${name}" ]] || [[ ! "${name}" =~ ${CONTAINER_RE} ]]; then
    echo "Denied: invalid container name" >&2
    exit 1
  fi
  
  do_exec "${cmd}" "${name}" "$@"
fi

