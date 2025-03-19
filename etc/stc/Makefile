lib=stc
user=charles
home=/home/$(user)
wd=$(home)/folio-import
inv2=$(wd)/inventory2
login=$(wd)/configs/json/stc-test.json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
idir=$(data)/inv
udir=$(data)/users
adir=$(data)/auth
cdir=$(data)/circ
in=$(data)/incoming
mfile=$(idir)/bibs.mrc
log=$(data)/log
tsvdir=$(wd)/etc/$(lib)

instances: $(in)/*.mrc
	cd $(idir); ln -s $(in)/*.mrc raw.marc
	cd $(idir); ln -s $(in)/*Instance-Level* inst-level.txt
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst-stc conf/stc.json $(idir)/inst-level.txt $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

items: $(in)/Inv*Standard*txt
	cd $(idir); ln -s $(in)/Inv*Standard*txt items.txt
	cd $(idir); ln -s $(in)/Inv*Custom*txt custom.txt
	cd $(inv2); node holdingsItems-stc conf/stc.json $(idir)/bibs.map $(idir)/custom.txt $(idir)/items.txt > $(log)/makeHoldingsItems.log
	cat $(log)/makeHoldingsItems.log

clean-inventory:
	cd $(idir); rm *.marc *.mrc *.txt count*

authorities: $(in)/Auth*xml
	cd $(adir); ln -s $(in)/Auth*xml auth.xml
	cd $(inv2); node xml2marc-stc $(adir)/auth.xml
	cd $(wd)/auth; ./marc2auth010.pl $(wd)/mapping_rules/marc_authority_rules.json $(iref) $(adir)/auth.mrc > $(log)/makeAuth.log &
	tail -f $(log)/makeAuth.log

clean-authorities: $(adir)/auth.xml
	cd $(adir); rm *.xml

checkouts: $(in)/Loans*
	cd $(cdir); ln -s $(in)/Loans* loans.txt
	cd $(wd); [ -f $(cdir)/users.jsonl ] || node downloadJSONL users $(cdir)/users.jsonl
	cd $(wd); [ -f $(cdir)/items.jsonl ] || node downloadJSONL item-storage/items $(cdir)/items.jsonl
	cd $(wd)/patrons; node stcCheckouts $(cdir)/loans.txt > $(log)/makeCheckouts.log
	cat $(log)/makeCheckouts.log

clean-checkouts: 
	cd $(cdir); rm *.txt

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
