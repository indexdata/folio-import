lib=scu
lscript=login-$(lib)-test.sh
home=/home/charles
data=$(home)/$(lib)
invdir=$(data)/inv
mfile=$(invdir)/bibs.mrc
log=$(data)/log
wd=$(home)/folio-import
tsvdir=$(wd)/etc/$(lib)
iref=$(data)/ref/inv
aref=$(data)/ref/acq
rules=$(wd)/etc/scu/mapping-rules.json
odir=$(data)/orders

instances:
	cd $(invdir); cat marc0*.mrc > bibs.mrc
	./marc2inst-$(lib).pl $(rules) $(iref) $(mfile) > $(log)/make-marc.log 2>$(log)/make-marc-err.log &

checkin-holdings:
	cd $(invdir); cat holdings0*.jsonl > checkins.jsonl
	./holdings-$(lib).pl $(iref) $(invdir)/bibs.map $(invdir)/checkins.jsonl > $(log)/make-holdings.log &

item:
	cd $(invdir); cat items0*.jsonl > items.jsonl
	./items-$(lib).pl $(iref) $(invdir)/bibs.map $(invdir)/items.jsonl > $(log)/make-items.log &

split-inventory: $(invdir)/bibs_instances.jsonl
	cd $(invdir); cat *-holdings.jsonl > all_holdings.jsonl
	split -l 325000 $(invdir)/bibs_instances.jsonl $(invdir)/in
	split -l 3000 $(invdir)/bibs_presuc.jsonl $(invdir)/ps
	split -l 160000 $(invdir)/all_holdings.jsonl $(invdir)/ho
	rm $(invdir)/all_holdings.jsonl
	split -l 240000 $(invdir)/items-items.jsonl $(invdir)/it
	split -l 325000 $(invdir)/bibs_srs.jsonl $(invdir)/sr

order:
	cd $(odir); cat orders0* > all_orders.jsonl
	cd $(wd)/acquisitions; node scuOrders.js $(aref) $(invdir)/bibs_instances.jsonl $(odir)/all_orders.jsonl

clean-inventory: $(iinfo)
	cd $(invdir); rm bibs.mrc; mv raw.marc raw.mrc

setup:
	cd $(wd); git pull	
	cp $(tsvdir)/*.tsv $(iref)
	cp $(tsvdir)/locations.tsv $(aref)
	cp $(tsvdir)/fund-codes.json $(aref)
	cp $(wd)/configs/bash/$(lscript) .
	cp $(wd)/bash/reference_inventory.sh .
	cp $(wd)/bash/reference_acq.sh .
	cp $(wd)/bash/reference_finance.sh .
	cp $(wd)/inventory/marc2inst-$(lib).pl .
	cp $(wd)/inventory/holdings-$(lib).pl .
	cp $(wd)/inventory/items-$(lib).pl .
	mkdir -p $(iref)
	mkdir -p $(aref)
	mkdir -p $(log)
	./$(lscript)
	./reference_inventory.sh $(iref)
	./reference_acq.sh $(aref)
	./reference_finance.sh $(aref)

clean:
	rm -rf $(iref)
	rm -rf $(aref)
	rm marc2inst-$(lib).pl
	rm reference_*.sh
	rm $(lscript)
