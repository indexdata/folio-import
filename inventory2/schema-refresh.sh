#!/bin/bash

wget 'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/master/ramls/instance.json' -O schemas/instance.json
wget 'https://raw.githubusercontent.com/folio-org/mod-entities-links/refs/heads/master/src/main/resources/swagger.api/schemas/authority-storage/authorityDto.yaml' -O schemas/authorityDto.yaml