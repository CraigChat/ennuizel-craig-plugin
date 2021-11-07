PREFIX=inst

all: ennuizel-craig.js

ennuizel-craig.js: ennuizel-craig.ts node_modules/.bin/tsc
	./node_modules/.bin/tsc -t es5 --lib es2015,dom $<

node_modules/.bin/tsc:
	npm install

install:
	mkdir -p $(PREFIX)
	install -m 0622 ennuizel-craig.js $(PREFIX)/ennuizel-craig.js

clean:
	rm -f ennuizel-craig.js

distclean: clean
	rm -rf node_modules
