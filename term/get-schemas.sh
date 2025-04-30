#!/bin/bash

cd schemas

wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/locinst.json' -O institutions.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/loccamp.json' -O campuses.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/loclib.json' -O libraries.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/locations/location.json' -O locations.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/alternativetitletype.json' -O alternativetitletypes.json
