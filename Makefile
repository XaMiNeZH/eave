UUID := dynamic-island@xaminezh.xyz
SRC := src
ZIP := $(UUID).shell-extension.zip

.PHONY: all check schemas test zip install uninstall try clean

all: check zip

schemas:
	glib-compile-schemas $(SRC)/schemas

test:
	gjs --module tests/test-activity-stack.js
	gjs --module tests/test-motion.js
	gjs --module tests/test-clock-format.js
	gjs --module tests/test-geometry.js
	gjs --module tests/test-fonts.js
	gjs --module tests/test-squircle.js
	gjs --module tests/test-glyphs.js
	gjs --module tests/test-media-style.js
	gjs --module tests/test-control-target.js
	gjs --module tests/test-low-battery.js
	gjs --module tests/test-panel-media.js

check: schemas test
	python3 -c "import json; json.load(open('$(SRC)/metadata.json'))"
	test -f $(SRC)/extension.js
	test -f $(SRC)/prefs.js
	test -f $(SRC)/stylesheet.css
	test -f $(SRC)/schemas/gschemas.compiled
	test -f $(SRC)/fonts/Inter-Regular.ttf
	test -f $(SRC)/fonts/Inter-SemiBold.ttf
	test -f $(SRC)/fonts/OFL.txt

zip: schemas
	rm -f $(ZIP)
	cd $(SRC) && zip -r ../$(ZIP) . \
		-x 'schemas/*~' \
		-x '*.orig'

install: schemas
	./install.sh

try: schemas
	./tools/try.sh

uninstall:
	./uninstall.sh

clean:
	rm -f $(ZIP) $(SRC)/schemas/gschemas.compiled
