lib=msm
user=charles
home=/home/$(user)
wd=$(home)/folio-import
etc=$(wd)/etc/$(lib)
inv2=$(wd)/inventory2
acq=$(wd)/acquisitions
pat=$(wd)/patrons
conf=$(inv2)/conf/msm.json
login=$(wd)/configs/json/msmnyc-test.json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
aref=$(ref)/acq
idir=$(data)/inv
udir=$(data)/usr
adir=$(data)/auth
cdir=$(data)/circ
odir=$(data)/ord
vdir=$(data)/org
in=$(data)/incoming
raw=$(in)/All_bibs*
mfile=$(idir)/bibs.mrc
log=$(data)/log

inventory: $(raw)
	cd $(idir); rm -r raw.marc; ln -s $(raw) raw.marc
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst-msm $(conf) $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

split-inventory:
	cd $(idir); split -l 25000 bibs-instances.jsonl in-
	cd $(idir); split -l 25000 bibs-srs.jsonl sr-
	cd $(idir); split -l 25000 bibs-holdings.jsonl ho-
	cd $(idir); split -l 30000 bibs-items.jsonl it-

circulation:
	cd $(cdir); rm -r circ.csv; ln -s $(in)/circ*.csv circ.csv
	cd $(wd); node downloadJSONL users $(cdir)/users.jsonl
	cd $(wd); node downloadJSONL service-points $(cdir)/service-points.jsonl
	cd $(pat); node msmCirc $(cdir)/circ.csv > $(log)/makeCirc.log
	cat $(log)/makeCirc.log

organizations:

orders:
	cd $(odir); rm -r orders.csv; ln -s $(in)/*orders*.csv orders.csv
	cd $(acq); node msmOrders $(aref) $(idir)/bibs-instances.jsonl $(odir)/orders.csv > $(log)/makeOrders.log
	cat $(log)/makeOrders.log

load-orders:
	cd $(wd); node postJSONL orders/composite-orders $(odir)/purchase-orders.jsonl
	cd $(wd); node postJSONL orders-storage/po-lines $(odir)/po-lines.jsonl
	cd $(wd); node putJSONL orders/composite-orders $(odir)/purchase-orders-open.jsonl

setup:
	cp $(login) $(wd)/config.json
	jq '. | .logpath="$(log)"' $(wd)/config.json > tmp
	mv tmp $(wd)/config.json
	mkdir -p $(ref)
	mkdir -p $(log)
	mkdir -p $(idir)
	mkdir -p $(udir)
	mkdir -p $(adir)
	mkdir -p $(cdir)
	mkdir -p $(in)
	mkdir -p $(odir)
	mkdir -p $(vdir)
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
	rm -rf $(cdir)
	rm -rf $(in)
	rm -rf $(odir)
	rm -rf $(vdir)

