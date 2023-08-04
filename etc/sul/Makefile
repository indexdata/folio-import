home=/Users/charles/Folio
data=$(home)/sul
ldir=$(data)/loans
loans=$(ldir)/loans.csv
pdir=$(data)/proxy
pfile=$(pdir)/sponsor-proxy.csv
log=$(data)/log
wd=$(home)/folio-import
shared=$(data)/shared
sp=$(shared)/service-points.json
users=$(shared)/users.json

circ: $(cfile)
	cd $(wd)/util; node xlsx2csv.js $(cfile)

proxies: $(pfile)
	cd $(wd)/patrons; node sulProxies.js $(users) $(pfile)
	
load-proxies: $(pdir)/proxiesfor.jsonl
	grep sul $(wd)/config.js
	cd $(wd); node postJSONL.js proxiesfor $(pdir)/proxiesfor.jsonl

checkouts: $(loans)
	cd $(wd)/patrons; node sulCheckouts.js $(sp) $(users) $(loans)

setup:
	# cd $(wd); git pull	
	cp $(wd)/configs/bash/login-stanford.sh .
	cp $(wd)/bash/reference_feefines.sh .
	mkdir -p $(shared)
	mkdir -p $(log)
	./login-stanford.sh
	./reference_feefines.sh $(shared)
	grep stanford $(wd)/config.js
	cd $(wd); node downloadAllByEndpoint service-points $(shared)
	cd $(wd); node downloadAllByEndpoint users $(shared)

clean:
	rm -rf $(shared)
	rm login-stanford.sh
	rm reference_feefines.sh
