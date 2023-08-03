home=/Users/charles/Folio
data=$(home)/lane
invdir=$(data)/inv
mfile=$(invdir)/lane-bibs-and-mfhds.mrc
ifile=$(invdir)/lane-item-info.xlsx
iinfo=$(invdir)/item_info.tsv
orddir=$(data)/orders
circdir=$(home)/sul/lane
cfile=$(circdir)/Circ*xlsx
log=$(data)/log
wd=$(home)/folio-import
iref=$(data)/inv-ref
aref=$(data)/acq-ref

inventory: $(mfile) $(ifile)
ifeq ($(wildcard $(iinfo)),)
	cd $(wd)/util; node xlsx2csv.js $(ifile) tsv
endif
	./marc2inst-lane.pl mapping-rules.json $(iref) $(mfile) > $(log)/make-marc.log 2>$(log)/make-marc-err.log &

clean-inventory: $(iinfo)
	rm $(invdir)/*.tsv

circ: $(cfile)
	cd $(wd)/util; node xlsx2csv.js $(cfile)

orders: $(orddir)/orders0*jsonl
	cat $(orddir)/orders0*.jsonl > $(orddir)/iii-orders.jsonl
	cd $(wd)/acquisitions; node cubOrders.js $(aref) $(orddir)/iii-orders.jsonl > $(log)/make-orders.log &

users: $(userdir)/users0*.jsonl
	cat $(userdir)/users0*.jsonl > $(userdir)/iii-users.jsonl
	cd $(wd)/patrons; node cubUsers.js $(uref) $(userdir)/iii-users.jsonl > $(log)/make-users.log 2>$(log)/make-users-err.log &

checkouts: $(itemdir)/items00000000.jsonl
	cp $(wd)/etc/cub/spoints.tsv $(itemdir)
	cd $(wd)/patrons; node cubCheckouts.js $(iref)/service-points.json $(userdir)/users00000000.jsonl $(itemdir)/items00000000.jsonl > $(log)/make-checkouts.log &
	cd $(wd)/patrons; node cubProspectorCheckouts.js $(userdir)/users00000000.jsonl $(chkdir)/checkouts00000000.jsonl > $(log)/make-pcheckouts.log 

fines: $(finedir)/fines0*.jsonl
	cd $(wd); node authToken.js
	grep '"tenant":"cu"' $(wd)/.okapi
	cd $(wd)/patrons; node cubFines.js $(userdir)/users.map $(finedir)/fines0*jsonl > $(log)/make-fines.log 2>$(log)make-fines.err &

requests: $(reqdir)/holds00000000.jsonl
	cd $(wd)/patrons; node cubRequests.js $(userdir)/users.map $(reqdir)/holds00000000.jsonl Item > $(log)/make-requests.log &

setup:
	cd $(wd); git pull	
	cp $(wd)/configs/bash/login-stanford.sh .
	cp $(wd)/bash/reference_* .
	cp $(wd)/inventory/marc2inst-lane.pl .
	# cp $(wd)/mapping_rules/default.json mapping-rules.json
	mkdir -p $(iref)
	mkdir -p $(aref)
	mkdir -p $(log)
	./login-stanford.sh
	./reference_inventory.sh $(iref)
	./reference_finance.sh $(aref)
	./reference_acq.sh $(aref)
	./reference_org.sh $(aref)

clean:
	rm -rf $(iref)
	rm -rf $(uref)
	rm -rf $(aref)
	rm marc2inst-lane.pl
	rm reference_*
	rm login-stanford.sh
