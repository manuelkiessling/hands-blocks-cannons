#!/usr/bin/env bash

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

rsync \
  -avc \
  --exclude .DS_Store \
  --exclude .git/ \
  --exclude .idea/ \
  --exclude node_modules/ \
  --exclude dist/ \
  --delete \
  "$SCRIPT_FOLDER"/../ \
  www-data@152.53.168.103:/var/www/prod/gestures-apps/
