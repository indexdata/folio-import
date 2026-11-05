#!/bin/bash

GEN=/Users/charles/Folio/gen
MRC=$GEN/data/bibs.mrc
REF=$GEN/ref
WD=/Users/charles/Folio/folio-import
INV=$WD/inventory2
CONF=$INV/conf/gen.json

if [ ! -e "$REF/inv" ]
then
    cd $WD
    node migrationRef $REF inv
    cd $INV
fi

node marc2inst2 $CONF $MRC
echo "Make holdings and items"
node holdingsItems-dum $CONF $GEN/data/bibs.map