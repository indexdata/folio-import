#!/bin/bash

SCRIPT=$1
GLOB=$2
if [ ! $GLOB ]
  then
    echo 'Usage: ./run_glob <nodejs_script> <file_glob>'
    exit
fi

for f in ${@:2}; do
  CMD="node ${SCRIPT} ${f}"
  echo "Running: ${CMD}"
  $CMD
done
