#!/bin/bash

for x in  *.xlsx; do
	cd ~/folio-import/util/; node xlsx2csv "/home/charles/aas/org/$x"
done
