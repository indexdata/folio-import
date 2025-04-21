lib=pcom
user=charles
home=/home/$(user)
wd=$(home)/folio-import
inv2=$(wd)/inventory2
login=$(wd)/configs/json/pcom-test.json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
idir=$(data)/inv
udir=$(data)/usr
adir=$(data)/auth
cdir=$(data)/circ
in=$(data)/incoming
mfile=$(idir)/bibs.mrc
log=$(data)/log
tsvdir=$(wd)/etc/$(lib)

instances: $(in)/*.mrc
	cd $(idir); ln -s $(in)/I*.mrc raw.marc
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst conf/pcom.json $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

items: $(in)/Item*.csv
	cd $(idir); cp $(in)/ItemData* items.csv
	cd $(idir); cp $(in)/ItemNote* notes.csv
	cd $(inv2); node holdingsItems-pcom conf/pcom.json $(idir)/bibs-mfhds.jsonl > $(log)/makeHoldingsItems.log
	cat $(log)/makeHoldingsItems.log

clean-inventory:
	cd $(idir); rm *.marc *.mrc *.csv count*

authorities: $(in)/Auth*mrc
	cd $(adir); ln -s $(in)/Auth*.mrc auth.mrc
	cd $(wd)/auth; ./marc2auth010.pl $(wd)/mapping_rules/marc_authority_rules.json $(iref) $(adir)/auth.mrc > $(log)/makeAuth.log &
	tail -f $(log)/makeAuth.log

clean-authorities: $(adir)/auth.mrc
	cd $(adir); rm *.mrc

users: $(in)/Users*csv
	cd $(udir); ln -s $(in)/Users*csv users.csv
	cd $(udir); grep -vc USERNAME users.txt > count.txt; cat count.txt
	cd $(wd)/patrons; node pcomUsers $(uref) $(udir)/users.csv > $(log)/makeUsers.log
	cat $(log)/makeUsers.log

clean-users: $(udir)/*.csv
	rm $(udir)/*.csv

checkouts: $(in)/Circ*csv
	cd $(cdir); cp $(in)/Circ* loans.csv
	cd $(wd); [ -f $(cdir)/users.jsonl ] || node downloadJSONL users $(cdir)/users.jsonl
	cd $(wd); [ -f $(cdir)/items.jsonl ] || node downloadJSONL item-storage/items $(cdir)/items.jsonl
	cd $(wd)/patrons; node stcCheckouts $(cdir)/loans.txt > $(log)/makeCheckouts.log
	cat $(log)/makeCheckouts.log

setup:
	cp $(login) $(wd)/config.json
	# sed -e 's#"logpath":.*#"logpath": "$(log)",#' $(wd)/config.json > tmp
	jq '. | .logpath="$(log)"' $(wd)/config.json > tmp
	mv tmp $(wd)/config.json
	mkdir -p $(ref)
	mkdir -p $(log)
	mkdir -p $(idir)
	mkdir -p $(udir)
	mkdir -p $(adir)
	mkdir -p $(cdir)
	mkdir -p $(in)
	cd $(wd); node migrationRef.js $(ref)
	cp $(tsvdir)/locations.tsv $(iref)
	cp $(tsvdir)/mtypes.tsv $(iref)
	cp $(tsvdir)/groups.tsv $(uref)
	cp $(iref)/service-points.json $(cdir)
clean:
	rm -rf $(ref)

really-clean:
	rm -rf $(ref)
	rm -rf $(log)
	rm -rf $(idir)
	rm -rf $(udir)
	rm -rf $(adir)
	rm -rf $(cdir)
	rm -rf $(in)

