lib=emerson
lscript=login-$(lib)-test.sh
home=/home/charles
data=$(home)/$(lib)
invdir=$(data)/supp
mfile=$(invdir)/bibs.mrc
log=$(data)/log2
wd=$(home)/folio-import
tsvdir=$(wd)/etc/$(lib)
iref=$(data)/ref/inv
aref=$(data)/ref/acq
rules=$(wd)/mapping_rules/default.json
split=-l 40000

inventory:
	cd $(invdir); mv *.mrc raw.marc
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(invdir)/raw.marc > $(mfile)
	./marc2inst-$(lib).pl $(rules) $(iref) $(mfile) > $(log)/make-marc.log 2>$(log)/make-marc-err.log &

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
	cp $(wd)/inventory/marc2inst-$(lib).pl .
	mkdir -p $(iref)
	mkdir -p $(aref)
	mkdir -p $(log)
	./$(lscript)
	./reference_inventory.sh $(iref)
	./reference_acq.sh $(aref)
	cp $(tsvdir)/*.tsv $(iref)

clean:
	rm -rf $(iref)
	rm -rf $(aref)
	rm marc2inst-$(lib).pl
	rm reference_*.sh
	rm $(lscript)
