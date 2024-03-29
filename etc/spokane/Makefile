assets = hz-okapi/assets
inv = /data/spl/inventory
users = /data/spl/users
loans = /data/spl/loans
feesfines = /data/spl/feesfines
feesfines-input = /data/spl/hz-okapi/assets/json/hz-ledger.json
mrc = bibs.mrc
enc = utf8.mrc
wd = ~/folio-import
ten = spokane
ref = /data/spl/ref
refinv = $(ref)/inventory_storage_module
refcir = $(ref)/circulation_storage_module
log = log

help:
	@echo "Usage: make [ help | remove-default-ref | inventory-ref | groups | circ-ref | feesfines-ref | configurations | templates | marc | instances | holdings-items | users | loans | toggle-inactive-users | requests | feesfines | feesfines-assess | feesfines-transform | clean-feesfines | clean-inventory | clean-users | clean-loans | clean-requests ]"

remove-default-ref:
	cd $(wd); grep "$(ten)-okapi" config.js
	cd $(wd); node deleteByEndpoint.js locations
	cd $(wd); node deleteByEndpoint.js location-units/libraries
	cd $(wd); node deleteByEndpoint.js location-units/campuses
	cd $(wd); node deleteByEndpoint.js location-units/institutions
	cd $(wd); node deleteByEndpoint.js service-points
	cd $(wd); node deleteByEndpoint.js groups

inventory-ref:
	cd $(wd); grep "$(ten)-okapi" config.js
	cd $(wd); node loadRefData.js \
		$(refinv)/service-points.json \
		$(refinv)/*location*.json \
		$(refinv)/material-types.json \
		$(refinv)/loan-types.json \
		$(refinv)/calendar*.json

groups:
	cd $(wd); grep "$(ten)-okapi" config.js
	cd $(wd); node loadRefData.js $(ref)/users/groups.json

circ-ref:
	cd $(wd); grep "$(ten)-okapi" config.js
	cd $(wd); node loadRefData.js $(refcir)/*.json

feesfines-ref:
	cd $(wd); grep "$(ten)-okapi" config.js
	cd $(wd); node loadRefData.js $(ref)/feesfines/*.json

configurations:
	cd $(wd); grep "$(ten)-okapi" config.js
	cd $(wd); node loadRefData.js $(ref)/configuration/*entries*json

templates:
	cd $(wd); grep "$(ten)-okapi" config.js
	cd $(wd); node loadRefData.js $(ref)/template_engine_module/*.json

marc: $(assets)/marc/gr*.mrc
	mkdir $(inv)
	cat $(assets)/marc/gr*.mrc > $(inv)/$(mrc)
	@echo Generating record count...
	yaz-marcdump $(inv)/$(mrc) | grep -P '^\d{5}' -c > $(inv)/count
	@cat $(inv)/count
	@echo Converting to utf8
	yaz-marcdump -f marc8 -t utf8 -o marc -l 9=97 $(inv)/$(mrc) > $(inv)/$(enc)
	$(wd)/perl/marc_ctrl_fix.pl $(inv)/$(enc)

instances: $(inv)/$(enc)
	@echo Getting fresh reference data...
	$(wd)/bash/login-$(ten).sh
	$(wd)/bash/reference_inventory.sh $(inv)/ref
	$(wd)/perl/marc2inst.pl $(wd)/mapping_rules/spl.json $(inv)/ref/ $(inv)/utf8_fixed.mrc
	cd $(inv); split -l 25000 utf8_fixed_instances.jsonl inst

holdings-items: $(inv)/$(enc)
	jq -r '.mtypes[] | .code + "\t" + .name' $(assets)/json/collections.json > $(inv)/ref/collections.tsv
	cat $(assets)/json/hz-holdings-\(*.json > $(inv)/holdings.json
	if [ ! -e "$(inv)/instances.map" ]; then mv $(inv)/*.map $(inv)/instances.map; fi
	$(wd)/perl/items_spl.pl $(inv)/ref/ $(inv)/holdings.json > $(log)/makeholdings.log
	cd $(inv); split -l 30000 holdings_holdings.jsonl h
	cd $(inv); split -l 40000 holdings_items.jsonl it

users: $(assets)/json/hz-users-*
	mkdir $(users)
	cd $(wd); node downloadAllByEndpoint.js groups $(users)
	cat $(assets)/json/hz-users-* > $(users)/hz-users.json
	grep 'borrower#' $(users)/hz-users.json -c > $(users)/count
	@echo 'Record count:'
	cat $(users)/count
	cd $(wd)/bash; ./login-$(ten).sh
	cd $(wd)/bash; ./reference_users.sh $(users)/
	cd $(wd)/patrons; node splUsers.js $(users)/hz-users.json
	cd $(wd); grep "$(ten)-okapi" config.js
	cd $(wd); node splitLargeJson 50000 $(users)/users_00001.json users
	cd $(wd); node splitLargeJson 50000 $(users)/perms.json permissionUsers
	cd $(wd); node splitLargeJson 50000 $(users)/logins.json

loans: $(assets)/json/hz-loans-\(*
	mkdir $(loans)
	jq '.[]' $(assets)/json/hz-loans-\(* | jq -s . > $(loans)/hz-loans.json
	cd $(wd); grep "$(ten)-okapi" config.js
	@echo --- Downloading users...
	cd $(wd); node downloadAllUsers.js $(loans)
	@echo --- Downloading service-points...
	cd $(wd); node downloadAllByEndpoint.js service-points $(loans)
	@echo --- Creating checkout objects...
	cd $(wd)/patrons; node splCheckouts.js $(loans)/service-points.json $(loans)/users.json $(loans)/hz-loans.json

toggle-inactive-users: $(loans)/inactive_checkouts.json
	cd $(wd); node usersActiveToggle.js $(loans)/inactive_checkouts.json
	@echo --- You are now set to run checkoutByBarcode.js ---
	@echo --- Make sure to run this rule again after loans are loaded ---

requests: $(assets)/json/hz-requests.json
	mkdir requests
	cp $(assets)/json/hz-requests.json requests/requests.json
	grep 'request#' requests/requests.json -c > requests/count;

feesfines:
	@echo --- Getting system data for feesfines ...
	cd $(wd); grep "$(ten)-okapi" config.js
	mkdir $(feesfines)
	@echo --- Downloading some reference data ...
	cd $(wd); node downloadAllByEndpoint.js locations $(feesfines)
	cd $(wd); node downloadAllByEndpoint.js material-types $(feesfines)
	cd $(wd); node downloadAllByEndpoint.js service-points $(feesfines)
	@echo --- Get the map of users ...
	cd $(wd); node downloadAllUsers.js $(feesfines)
	cat $(feesfines)/users.json \
		| jq -r '.users[] | select(has("externalSystemId")) | [ .externalSystemId, .id ] | @tsv' \
		> $(feesfines)/users-map.tsv
	@echo --- Get the items data ...
	cd $(wd); node downloadAllItems.js $(feesfines)
	@echo --- Get the loans data ...
	cd $(wd); node downloadAllByEndpoint.js loan-storage/loans $(feesfines)
	cd $(feesfines); jq '{loans: [ .loans[] | select(has("userId")) ]}' loan-storage__loans.json \
		> loans.json

feesfines-assess: feesfines
	@echo --- Assessing feesfines data ...
	@echo --- Count input records ...
	jq 'length' $(feesfines-input)
	@echo --- Copy support data ...
	cp $(wd)/python/spl-feesfines/verbs-map.tsv $(feesfines)
	@echo --- Showing any unique blocks which are missing from the verbs map ...
	cd $(feesfines); jq -r '.[] | .block' $(feesfines-input) | sort -u > ledger-blocks-unique.txt
	cd $(feesfines); cat verbs-map.tsv | cut -f 1 | comm -23 ledger-blocks-unique.txt -

feesfines-transform: feesfines-assess
	@echo --- Doing $@ ...
	cp /data/dcrossley/spl-feesfines/uuids-ff.json $(feesfines)
	cd $(feesfines); python3 $(wd)/python/spl-feesfines/spl_feesfines.py \
		-u users-map.tsv -m items.json -n loans.json -v verbs-map.tsv \
		-c locations.json -y material-types.json -p service-points.json \
		-l debug \
		-i $(feesfines-input)
	cp -p $(feesfines)/uuids-ff.json /data/dcrossley/spl-feesfines
	cat $(feesfines)/summary-feesfines.json | grep "num"

feesfines-test-transform: feesfines-assess
	@echo --- Doing $@ ...
	cp /data/dcrossley/spl-feesfines/uuids-ff-test.json $(feesfines)
	cd $(feesfines); python3 $(wd)/python/spl-feesfines/spl_feesfines.py \
		-u users-map.tsv -m items.json -n loans.json -v verbs-map.tsv \
		-c locations.json -y material-types.json -p service-points.json \
		-o feesfines-accounts-test.jsonl -a feesfines-actions-test.jsonl \
		-j feesfines-adjustments-test.jsonl -t feesfines-transactions-test.jsonl \
		-e errors-feesfines-test.json -s summary-feesfines-test.json \
		-f uuids-ff-test.json -l debug \
		-i /data/dcrossley/spl-feesfines/hz-ledger-test-6.json
	cp -p $(feesfines)/uuids-ff-test.json /data/dcrossley/spl-feesfines
	cat $(feesfines)/summary-feesfines-test.json | grep "num"

.PHONY: feesfines-test-transform

clean-inventory:
	rm -rf $(inv)

clean-users:
	rm -rf $(users)

clean-loans:
	rm -rf $(loans)

clean-requests:
	rm -rf requests

clean-feesfines:
	rm -rf $(feesfines)
