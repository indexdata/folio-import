wd = ~/folio-import
login = login-holycross-test.sh
data = /data/sftpusers/holycross/migration
inv-dir = $(data)/marc
holdings-dir = $(data)/holdings
orders-dir = $(data)/orders
users-dir = /data/sftpusers/holycross/users
iv-dir = $(data)/invoices
pat-dir = $(users-dir)/Sierra\ Patrons
acq-ref = $(data)/acq-ref
inv-ref = $(data)/inv-ref
usr-ref = $(data)/usr-ref
line = "------------------------------------------"

help:
	@echo "Usage: make [ help | setup | inventory | iii-holdings | users | checkouts | active-toggle | orders-from-marc ]"

inventory: 
	mv $(inv-dir)/*.out $(inv-dir)/bibs.mrc
	@echo $(line)
	./marc2inst-hc.pl $(wd)/mapping_rules/holycross.json $(inv-ref) $(inv-dir)/bibs.mrc
	@echo $(line)

inventory-multi: 
	rm -f $(inv-dir)/x0*.mrc 
	@echo "Splitting MARC file"
	yaz-marcdump -C 265000 -s $(inv-dir)/x $(inv-dir)/*.out > /dev/null
	for x in $(inv-dir)/x0*; do mv $$x $$x.mrc; done
	./run-multi.sh ./marc2inst-hc.pl $(wd)/mapping_rules/holycross.json $(inv-ref) $(inv-dir)/x0*.mrc

clean-inventory:
	rm $(inv-dir)/*.jsonl
	rm $(inv-dir)/*.map
	mv $(inv-dir)/bibs.mrc $(inv-dir)/bibs.mrc.out

iii-holdings:
	mv $(holdings-dir)/groovy*json $(holdings-dir)/iii-holdings.json
	cat $(inv-dir)/*.map > $(holdings-dir)/bibs.map
	./holdings-hc.pl $(inv-ref) $(holdings-dir)/bibs.map $(holdings-dir)/iii-holdings.json

clean-iii-holdings:
	mv $(holdings-dir)/iii-holdings.json $(holdings-dir)/groovy-holdings.json
	rm $(holdings-dir)/bibs.map
	rm $(holdings-dir)/*.jsonl
presuc: 
	grep holycross_admin $(wd)/config.js
	cat $(inv-dir)/*presuc*jsonl > $(inv-dir)/all_presuc.jsonl
	cd $(wd); node makePreSuc.js $(inv-dir)/all_presuc.jsonl

users: $(pat-dir)/groovy*.json
	cat $(pat-dir)/groovy*.json > $(pat-dir)/iii-users.json
	cd $(wd)/patrons; node hcUsers.js $(usr-ref) $(pat-dir)/iii-users.json > $(pat-dir)/create.log
	@echo "Log is located at $(pat-dir)/create.log"

users-old: $(users-dir)/*.txt
	cat $(users-dir)/*.txt > $(users-dir)/users.psv
	node $(wd)/patrons/hcUsers.js $(usr-ref) $(users-dir)/users.psv

checkouts: $(pat-dir)/checked*txt
	cp $(pat-dir)/checked*xlsx $(pat-dir)/iii-checkouts.xlsx
	cd $(wd)/util; node xlsx2csv.js $(pat-dir)/iii-checkouts.xlsx
	mv $(pat-dir)/Sheet1.csv $(pat-dir)/iii-checkouts.csv
	@echo "Downloading all users..."
	cd $(wd); node downloadAllByEndpoint.js users $(pat-dir)
	@echo "Getting service-points..."
	cd $(wd); node downloadAllByEndpoint.js service-points $(pat-dir)
	cd $(wd)/patrons; node hcCheckouts.js $(pat-dir)/service-points.json $(pat-dir)/users.json $(pat-dir)/iii-checkouts.csv
	@echo $(line)
	@echo "1. Run make active-toggle (if inactive users found)"
	@echo "2. Download all patron-block-limits"
	@echo "3. Delete all patron-block-limits"
	@echo "4. Run checkoutByBarcode.js script"
	@echo "5. After checkouts finish running, post back the patron-block-limits"
	@echo "6. Run make active-toggle again"
	@echo $(line)

active-toggle: $(pat-dir)/inactive_checkouts.json
	cd $(wd); node usersActiveToggle.js $(pat-dir)/inactive_checkouts.json

clean-users: $(users-dir)/users.psv
	rm $(users-dir)/users.psv

setup:
	cd $(wd); git pull
	@echo $(line)
	@echo "Copying scripts to ${PWD}"
	@echo $(line)
	cp $(wd)/configs/bash/login-holycross-test.sh .
	cp $(wd)/configs/bash/login-holycross.sh .
	cp $(wd)/bash/reference* .
	cp $(wd)/perl/marc2inst-hc.pl .
	cp $(wd)/perl/holdings-hc.pl .
	@echo $(line)
	@echo "Creating reference data directorys"
	@echo $(line)
	mkdir $(acq-ref); chown ${USER}.admin $(acq-ref)
	mkdir $(inv-ref); chown ${USER}.admin $(inv-ref)
	mkdir $(usr-ref); chown ${USER}.admin $(usr-ref)
	@echo $(line)
	@echo "Getting reference data..."
	@echo $(line)
	./$(login) > /dev/null
	./reference_inventory.sh $(inv-ref)
	./reference_acq.sh $(acq-ref)
	./reference_org.sh $(acq-ref)
	./reference_finance.sh $(acq-ref)
	./reference_users.sh $(usr-ref)
	@echo $(line)
	@echo "Copying tsv files to reference directories"
	@echo $(line)
	cp $(wd)/etc/holycross/statuses.tsv $(inv-ref)
	cp $(wd)/etc/holycross/mtypes.tsv $(inv-ref)
	cp $(wd)/etc/holycross/mtypes.tsv $(inv-ref)/loantypes.tsv
	cp $(wd)/etc/holycross/ptypes.tsv $(usr-ref)

orders-from-marc:
	mv $(orders-dir)/*.mrc $(orders-dir)/orders.mrc;
	cat $(inv-dir)/*.map > $(acq-ref)/bibs.map
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o json $(orders-dir)/orders.mrc | jq . -c > $(orders-dir)/orders.json
	node $(wd)/acquisitions/hcOrdersFromMarc.js $(acq-ref) $(orders-dir)/orders.json
	cat $(orders-dir)/*composite-orders.jsonl > $(orders-dir)/all-composite-orders.jsonl

invoices: $(iv-dir)/groovy*json
	cp $(iv-dir)/groovy*json $(iv-dir)/iii-invoices.json
	node $(wd)/acquisitions/hcInvoices.js $(acq-ref) $(orders-dir) $(iv-dir)/iii-invoices.json 1970

invoice-approvals:
	cd $(wd); node downloadJSONL.js invoice/invoices $(iv-dir)/temp.jsonl
	jq '.status="Approved"' $(iv-dir)/temp.jsonl -c > $(iv-dir)/approvals.jsonl

invoice-paid:
	cd $(wd); node downloadJSONL.js invoice-storage/invoices $(iv-dir)/temp.jsonl
	jq '.status="Paid"' $(iv-dir)/temp.jsonl -c > $(iv-dir)/paid.jsonl

clean-orders:
	mv $(orders-dir)/orders.mrc $(orders-dir)/all-orders.out.mrc
	rm $(orders-dir)/*.jsonl
	rm $(orders-dir)/*.log

clean:
	rm login*.sh
	rm reference*.sh
	rm *.pl
	rm -rf .okapi
	rm -rf $(acq-ref)
	rm -rf $(inv-ref)
	rm -rf $(usr-ref)
