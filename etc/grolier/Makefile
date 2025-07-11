lib=grolier
user=charles
home=/home/$(user)
wd=$(home)/folio-import
inv2=$(wd)/inventory2
login=$(wd)/configs/json/grolierclub-test.json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
idir=$(data)/inv
udir=$(data)/usr
adir=$(data)/auth
in=$(data)/incoming
mfile=$(idir)/bibs.mrc
log=$(data)/log

instances: $(in)/*.mrc
	cd $(idir); rm -r raw.marc; ln -s $(in)/*Bibs*.mrc raw.marc
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst conf/grolier.json $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

items: $(in)/*Items*xlsx
	cd $(idir); cp $(in)/*Items*xlsx items.xlsx
	cd $(wd)/util; node xlsx2csv.js $(idir)/items.xlsx
	mv $(idir)/items.*.csv $(idir)/items.csv
	cd $(inv2); node holdingsItems-grol conf/grolier.json $(idir)/bibs.map $(idir)/items.csv > $(log)/makeHoldingsItems.log
	cat $(log)/makeHoldingsItems.log

clean-inventory:
	cd $(idir); rm *.marc *.mrc *.csv count*

authorities: $(in)/*Auths*.mrc
	cd $(adir); rm -r auth.raw; ln -s $(in)/*Auths*.mrc auth.raw
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(adir)/auth.raw > $(adir)/auth.mrc
	cd $(wd)/auth; ./marc2auth010.pl $(wd)/mapping_rules/marc_authority_rules.json $(iref) $(adir)/auth.mrc > $(log)/makeAuth.log &
	tail -f $(log)/makeAuth.log

split-authorities: $(adir)/auth-authorities.jsonl
	cd $(adir); split -l 11000 auth-authorities.jsonl aa
	cd $(adir); split -l 11000 auth-srs.jsonl as

clean-authorities: $(adir)/auth.mrc
	cd $(adir); rm *.mrc

users: $(in)/Users*csv
	cd $(udir); ln -s $(in)/Users*csv users.csv
	cd $(udir); grep -vc USERNAME users.txt > count.txt; cat count.txt
	cd $(wd)/patrons; node pcomUsers $(uref) $(udir)/users.csv > $(log)/makeUsers.log
	cat $(log)/makeUsers.log
	cd $(udir); split -l 4000 users-users.jsonl users
	cd $(udir); split -l 4000 users-perms.jsonl perms
	cd $(udir); split -l 4000 users-request-prefs.jsonl prefs

clean-users: $(udir)/*.csv
	rm $(udir)/*.csv

checkouts: $(in)/Circ*csv
	cd $(cdir); cp $(in)/Circ* loans.csv
	cd $(wd); [ -f $(cdir)/users.jsonl ] || node downloadJSONL users $(cdir)/users.jsonl
	cd $(wd); [ -f $(cdir)/items.jsonl ] || node downloadJSONL item-storage/items $(cdir)/items.jsonl
	cd $(wd)/patrons; node pcomCheckouts $(cdir)/loans.csv > $(log)/makeCheckouts.log
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
	mkdir -p $(in)
	cd $(wd); node migrationRef.js $(ref)

clean:
	rm -rf $(ref)

really-clean:
	rm -rf $(ref)
	rm -rf $(log)
	rm -rf $(idir)
	rm -rf $(udir)
	rm -rf $(adir)
	rm -rf $(in)

