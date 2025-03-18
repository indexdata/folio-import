lib=stc
user=charles
home=/home/$(user)
wd=$(home)/folio-import
login=$(wd)/configs/json/stc-test.json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
idir=$(data)/inv
udir=$(data)/users
adir=$(data)/auth
mfile=$(invdir)/bibs.mrc
log=$(data)/log
tsvdir=$(wd)/etc/$(lib)

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
	cp $(login) $(wd)/config.json
	# sed -e 's#"logpath":.*#"logpath": "$(log)",#' $(wd)/config.json > tmp
	jq '. | .logpath="$(log)"' $(wd)/config.json > tmp
	mv tmp $(wd)/config.json
	mkdir -p $(ref)
	mkdir -p $(log)
	mkdir -p $(idir)
	mkdir -p $(udir)
	mkdir -p $(adir)
	cd $(wd); node migrationRef.js $(ref)
	cp $(tsvdir)/locations.tsv $(iref)
	cp $(tsvdir)/mtypes.tsv $(iref)
	cp $(tsvdir)/groups.tsv $(uref)
clean:
	rm -rf $(ref)
