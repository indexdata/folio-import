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
in=$(data)/incoming
mfile=$(idir)/bibs.mrc
log=$(data)/log
tsvdir=$(wd)/etc/$(lib)

instances: $(in)/*.mrc
	cd $(idir); ln -s $(in)/*.mrc raw.marc
	cd $(idir); ln -s $(in)/*Instance-Level* inst-level.txt
	cd $(idir); ln -s $(in)/*Inv*Standard*txt items.txt
	cd $(idir); ln -s $(in)/*Inv*Custom*txt custom.txt
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst-stc conf/stc.json $(idir)/inst-level.txt $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

items: $(idir)/items.txt
	cd $(inv2); node holdingsItems-stc conf/stc.json

clean-instances:
	cd $(idir); rm *.marc *.mrc *.txt count*

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
