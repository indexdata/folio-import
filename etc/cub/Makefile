data=/data/charles/colorado
marcdir=$(data)/marc2
itemdir=$(data)/item
holdir=$(data)/holdings
userdir = $(data)/users
orddir = $(data)/orders
finedir = $(data)/fines
log=$(data)/log
law=$(data)/law
home=/home/charles
sdir=$(home)/sierra-api/js
wd=$(home)/folio-import
iref=$(data)/inv-ref
uref=$(data)/usr-ref
aref=$(data)/acq-ref

get-marc-multi:
ifeq ($(wildcard $(marcdir)/.),)
	mkdir $(marcdir)
endif
	cd $(sdir); node downloadMarc.js -s 0 -e 1499 $(marcdir) > $(log)/marc0.log & 
	cd $(sdir); node downloadMarc.js -s 1500 -e 2999 $(marcdir) > $(log)/marc1.log & 
	cd $(sdir); node downloadMarc.js -s 3000 $(marcdir) > $(log)/marc2.log & 

get-marc:
ifeq ($(wildcard $(marcdir)/.),)
	mkdir $(marcdir)
endif
	cd $(sdir); node downloadMarc.js $(marcdir) > $(log)/get-marc.log & 

get-items-multi:
ifeq ($(wildcard $(itemdir)/.),)
	mkdir $(itemdir)
endif
	cd $(sdir); node downloadItems.js -s 0 -e 1999 $(itemdir) > $(log)/items0.log & 
	cd $(sdir); node downloadItems.js -s 2000 -e 3999 $(itemdir) > $(log)/items1.log & 
	cd $(sdir); node downloadItems.js -s 4000 $(itemdir) > $(log)/items2.log & 

get-items:
ifeq ($(wildcard $(itemdir)/.),)
	mkdir $(itemdir)
endif
	cd $(sdir); node downloadItems.js $(itemdir) > $(log)/get-items.log & 

get-holdings:
ifeq ($(wildcard $(holdir)/.),)
	mkdir $(holdir)
endif
	cd $(sdir); node downloadHoldings.js $(holdir) > $(log)/get-holdings.log 2>/dev/null & 

get-users:
ifeq ($(wildcard $(userdir)/.),)
	mkdir $(userdir)
endif
	cd $(sdir); node downloadUsers.js $(userdir) > $(log)/get-users.log &

get-fines:
ifeq ($(wildcard $(finedir)/.),)
	mkdir $(finedir)
endif
	cd $(sdir); node downloadFines.js $(finedir) > $(log)/get-fines.log &

get-orders:
ifeq ($(wildcard $(orddir)/.),)
	mkdir $(orddir)
endif
	cd $(sdir); node downloadOrders.js -c '*' $(orddir) > $(log)/get-orders.log &
	# cd $(sdir); node downloadOrders.js -c [2000-01-01,2023-06-30] $(orddir) > $(log)/orders.log &

instances: $(marcdir)/marc0*mrc
	cd $(marcdir); yaz-marcdump -C 1800000 -s m marc0*mrc >/dev/null
	cd $(marcdir); for f in m0*; do mv $$f $$f.mrc; done
	./run-multi.sh ./marc2inst-cub.pl mapping-rules.json $(iref) $(marcdir)/m0*.mrc > $(log)/make-marc.log 2>$(log)/make-marc-err.log &

items: $(itemdir)/items00000000.jsonl
	# wc -l $(itemdir)/items00000000.jsonl > $(itemdir)/count
	date > $(itemdir)/start
	cat $(marcdir)/*.map > $(itemdir)/instance.map
	cat $(holdir)/*.map > $(itemdir)/holdings.map
	cd $(wd)/inventory; ./items-cub.pl $(iref) $(itemdir)/instance.map $(itemdir)/holdings.map $(itemdir)/items00000000.jsonl > $(log)/make-items.log 2>$(log)/make-items-err.log &

clean-items: $(itemdir)/sierra-items.jsonl
	mv $(itemdir)/sierra-items.jsonl $(itemdir)/items000000X.jsonl

holdings: $(holdir)/*.jsonl
	cat $(marcdir)/*.map > $(holdir)/instance.map
	cd $(wd)/inventory; ./holdings-cub.pl $(iref) $(holdir)/instance.map $(holdir)/holdings00*jsonl > $(log)/make-holdings.log 2>$(log)/make-holdings-err.log &

orders: $(orddir)/orders0*jsonl
	cat $(orddir)/orders0*.jsonl > $(orddir)/iii-orders.jsonl
	cd $(wd)/acquisitions; node cubOrders.js $(aref) $(orddir)/iii-orders.jsonl > $(log)/make-orders.log &

users: $(userdir)/users0*.jsonl
	cat $(userdir)/users0*.jsonl > $(userdir)/iii-users.jsonl
	cd $(wd)/patrons; node cubUsers.js $(uref) $(userdir)/iii-users.jsonl 'folio@colorado.edu' > $(log)/make-users.log 2>$(log)/make-users-err.log &

fines: $(finedir)/fines0*.jsonl
	cd $(wd); node authToken.js
	grep '"tenant":"cu"' $(wd)/.okapi
	cd $(wd)/patrons; node cubFines.js $(userdir)/users.map $(finedir)/fines0*jsonl > $(log)/make-fines.log 2>$(log)make-fines.err &

law-setup:
	cd $(data); mkdir -p law
	cp ftp-culaw.sh $(law)
	cd $(law); ./ftp-culaw.sh
	mkdir -p $(law)/marc
	mkdir -p $(law)/item
	mkdir -p $(law)/orders
	mkdir -p $(law)/users
	mv $(law)/*.mrc $(law)/marc
	mv $(law)/*item*txt $(law)/item
	mv $(law)/*serial*txt $(law)/item/checkin-notes.txt
	mv $(law)/*order*txt $(law)/orders
	mv $(law)/*patrons*txt $(law)/users/law-patrons.txt

law-clean:
	cd $(law); mv */*.* ..

law-instances:
	cat $(law)/marc/*.mrc > $(law)/marc/law.mrc
	$(wd)/inventory/marc2inst-culaw.pl mapping-rules.json $(iref) $(law)/marc/law.mrc

law-items:
	cat $(law)/marc/*.map > $(law)/item/instance.map
	cat $(law)/item/*item*.txt > $(law)/item/law.csv
	cd $(wd)/inventory; node items-culaw.js $(iref) $(law)/item/instance.map $(law)/item/law.csv > $(log)/make-law-items.log &

law-users:
	cd $(wd)/patrons; node culawUsers.js $(uref) $(law)/users/law-patrons.txt 'folio@colorado.edu'

setup:
	cd $(wd); git pull	
	cp $(wd)/configs/bash/login-cu-test.sh .
	cp $(wd)/bash/reference_* .
	cp $(wd)/inventory/marc2inst-cub.pl .
	cp $(wd)/mapping_rules/default.json mapping-rules.json
	cp $(wd)/etc/cub/run-multi.sh .
	mkdir -p $(iref)
	mkdir -p $(uref)
	mkdir -p $(aref)
	mkdir -p $(log)
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
