data=/data/colorado
marcdir=$(data)/marc2
itemdir=$(data)/item
holdir=$(data)/holdings
userdir = $(data)/users
orddir = $(data)/orders
log=$(data)/log
home=/home/charles
sdir=$(home)/sierra-api/js
wd=$(home)/folio-import
iref=$(data)/inv-ref
uref=$(data)/usr-ref
aref=$(data)/acq-ref

get-marc:
ifeq ($(wildcard $(marcdir)/.),)
	mkdir $(marcdir)
endif
	cd $(sdir); node downloadMarc.js -s 0 -e 1499 $(marcdir) > $(log)/marc0.log & 
	cd $(sdir); node downloadMarc.js -s 1500 -e 2999 $(marcdir) > $(log)/marc1.log & 
	cd $(sdir); node downloadMarc.js -s 3000 $(marcdir) > $(log)/marc2.log & 

get-items:
ifeq ($(wildcard $(itemdir)/.),)
	mkdir $(itemdir)
endif
	cd $(sdir); node downloadItems.js -s 0 -e 1999 $(itemdir) > $(log)/items0.log & 
	cd $(sdir); node downloadItems.js -s 2000 -e 3999 $(itemdir) > $(log)/items1.log & 
	cd $(sdir); node downloadItems.js -s 4000 $(itemdir) > $(log)/items2.log & 

get-holdings:
ifeq ($(wildcard $(holdir)/.),)
	mkdir $(holdir)
endif
	cd $(sdir); node downloadHoldings.js $(holdir) > $(log)/iii-holdings.log 2>/dev/null & 

get-users:
ifeq ($(wildcard $(userdir)/.),)
	mkdir $(userdir)
endif
	cd $(sdir); node downloadUsers.js $(userdir) > $(log)/users.log &

get-orders:
ifeq ($(wildcard $(orddir)/.),)
	mkdir $(orddir)
endif
	cd $(sdir); node downloadOrders.js -c [2022-07-01,2022-08-30] $(orddir) > $(log)/orders.log &

instances: $(marcdir)/marc0*mrc
	./run-multi.sh ./marc2inst-cub.pl mapping-rules.json $(iref) $(marcdir)/marc0*.mrc > $(log)/make-marc.log 2>/dev/null &

items: $(itemdir)/*.jsonl
	cat $(marcdir)/*.map > $(itemdir)/instance.map
	cat $(itemdir)/items0*.jsonl > $(itemdir)/sierra-items.jsonl
	cd $(wd)/perl; ./items-cub.pl $(iref) $(itemdir)/instance.map $(itemdir)/sierra-items.jsonl > $(log)/make-items.log &

holdings: $(holdir)/*.jsonl
	cat $(marcdir)/*.map > $(holdir)/instance.map
	cd $(wd)/perl; ./holdings-cub.pl $(iref) $(holdir)/instance.map $(holdir)/holdings00*jsonl > $(log)/make-holdings.log 2>$(log)/make-holdings-err.log &

orders: $(orddir)/orders0*jsonl
	cat $(orddir)/orders0*.jsonl > $(orddir)/iii-orders.jsonl
	cd $(wd)/acquisitions; node cubOrders.js $(aref) $(orddir)/iii-orders.jsonl

users: $(userdir)/users0*.jsonl
	cat $(userdir)/users0*.jsonl > $(userdir)/iii-users.jsonl
	cd $(wd)/patrons; node cubUsers.js $(uref) $(userdir)/iii-users.jsonl 'folio@colorado.edu'

setup:
	cd $(wd); git pull	
	cp $(wd)/configs/bash/login-cu-test.sh .
	cp $(wd)/bash/reference_* .
	cp $(wd)/perl/marc2inst-cub.pl .
	cp $(wd)/mapping_rules/default.json mapping-rules.json
	mkdir $(iref)
	mkdir $(uref)
	mkdir $(aref)
	./login-cu-test.sh
	./reference_inventory.sh $(iref)
	./reference_users.sh $(uref)
	./reference_finance.sh $(aref)
	./reference_acq.sh $(aref)
	./reference_org.sh $(aref)
	cp $(wd)/etc/cub/*.tsv $(iref)
	cp $(wd)/etc/cub/*.* $(aref)
	cp $(wd)/etc/cub/ptypes.tsv $(uref)

clean:
	rm -rf $(iref)
	rm -rf $(uref)
	rm -rf $(aref)
