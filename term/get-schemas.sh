#!/bin/bash

cd schemas

wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/schemas/location-units/locinst.json' -O institutions.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/schemas/location-units/loccamp.json' -O campuses.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/schemas/location-units/loclib.json' -O libraries.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/schemas/locations/location.json' -O locations.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/schemas/instance-storage/instancerelationship.json' -O instance-relationship-types.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/schemas/instance-storage/instance.json' -0 instances.json
wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/refs/heads/master/ramls/schemas/alternative-title-types/alternativetitletype.json' -O alternative-title-types.json