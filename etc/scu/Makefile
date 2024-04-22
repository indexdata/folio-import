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
split=-l 350000

instances:
	cd $(invdir); cat marc0*.mrc > bibs.mrc
	./marc2inst-$(lib).pl $(rules) $(iref) $(mfile) > $(log)/make-marc.log 2>$(log)/make-marc-err.log &

checkin-holdings:
	cd $(invdir); cat holdings0*.jsonl > checkins.jsonl
	./holdings-$(lib).pl $(iref) $(invdir)/bibs.map $(invdir)/checkins.jsonl > $(log)/make-holdings.log &

item:
	cd $(invdir); cat items0*.jsonl > items.jsonl
	./items-$(lib).pl $(iref) $(invdir)/bibs.map $(invdir)/items.jsonl > $(log)/make-items.log &

split-inventory: $(invdir)/*.jsonl
	split $(split) $(invdir)/*instances.jsonl $(invdir)/in
	split $(split) $(invdir)/*holdings.jsonl $(invdir)/ho
	split $(split) $(invdir)/*items.jsonl $(invdir)/it
	split $(split) $(invdir)/*srs.jsonl $(invdir)/sr

clean-inventory: $(iinfo)
	cd $(invdir); rm bibs.mrc; mv raw.marc raw.mrc

setup:
	cd $(wd); git pull	
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
	cp $(tsvdir)/*.tsv $(iref)

clean:
	rm -rf $(iref)
	rm -rf $(aref)
	rm marc2inst-$(lib).pl
	rm reference_*.sh
	rm $(lscript)
