lib=dera
user=charles
home=/home/$(user)
wd=$(home)/folio-import
etc=$(wd)/etc/$(lib)
inv2=$(wd)/inventory2
conf=$(inv2)/conf/dera.json
login=$(wd)/configs/json/dera-test.json
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

inventory: $(in)/*Bibs*out
	cd $(idir); rm -r raw.marc; ln -s $(in)/*Bibs*out raw.marc
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst-dera $(conf) $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

authorities: $(in)/*Auths*.mrc
	cd $(adir); rm -r auth.raw; ln -s $(in)/*Auths*.mrc auth.raw
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(adir)/auth.raw > $(adir)/auth.mrc
	cd $(wd)/auth; ./marc2auth010.pl $(wd)/mapping_rules/marc_authority_rules.json $(iref) $(adir)/auth.mrc > $(log)/makeAuth.log &
	tail -f $(log)/makeAuth.log

split-authorities: $(adir)/auth-authorities.jsonl
	cd $(adir); split -l 6000 auth-authorities.jsonl aa
	cd $(adir); split -l 6000 auth-srs.jsonl as

users: $(in)/User*csv
	cd $(udir); rm -r users.csv; ln -s $(in)/User*csv users.csv
	cd $(udir); grep -vc Username users.csv > count.txt; cat count.txt
	cd $(wd)/patrons; node grolUsers $(uref) $(udir)/users.csv > $(log)/makeUsers.log
	cat $(log)/makeUsers.log

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
	cd $(etc); cp *.tsv $(iref);

clean:
	rm -rf $(ref)

really-clean:
	rm -rf $(ref)
	rm -rf $(log)
	rm -rf $(idir)
	rm -rf $(udir)
	rm -rf $(adir)
	rm -rf $(in)

