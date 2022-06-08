#!/bin/bash

PFILE=$1

if [ ! $PFILE ] 
then
  echo "Usage: ./make-mutable-perms.sh <folio-perms-file>"
  exit
fi

jq '{ permissions: [ .permissions[] | select(.mutable==true) ] }' $1
