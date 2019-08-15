# Urlbar Top Sites Experiment Extension

This is the extension for the urlbar top sites add-on experiment. When
installed, focusing Firefox's urlbar automatically opens the urlbar view and
shows the top sites from your new-tab page. (Two caveats: The view does not
automatically open when the current tab is the new-tab page itself since it
already shows your top sites. It also doesn't open in private windows.)

[Bug 1547279] is the meta bug that tracks this experiment.

[Bug 1547279]: https://bugzilla.mozilla.org/show_bug.cgi?id=1547279

## Requirements

* Firefox 69b13 or newer
* Either a Mozilla-signed version of the add-on; or Firefox Nightly, Developer
  Edition, or any other Firefox build that gives privileges to temporarily
  installed add-ons. This add-on uses Mozilla-privileged APIs (`browser.urlbar`
  and `browser.normandyAddonStudy`)

## Running

You can use [web-ext] or [about:debugging]. Both will load the add-on as a
temporary add-on, so you'll need to use Firefox Nightly, Developer Edition, or
any other Firefox build that gives privileges to temporarily installed add-ons.

[web-ext]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Getting_started_with_web-ext
[about:debugging]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Debugging

## Building

Use [web-ext] to build the add-on zip file.

## Testing

The `tests` directory contains a browser chrome mochitest and a `head.js`. The
`head.js` implements a simple framework for testing Normandy experiment add-on
files.

The requirements above for running the add-on apply to testing it, too. You'll
need either a Mozilla-signed version of the add-on; or Firefox Nightly,
Developer Edition, or any other Firefox build that gives privileges to
temporarily installed add-ons.

To run the test in a particular version of Firefox, you'll need to clone the
repo from which your Firefox was built. If you're testing in Nightly 70, you'll
need [mozilla-central]. If you're testing in Developer Edition 69 or Beta 69,
you'll need [mozilla-beta].

Then:

1. `cd` into your `urlbar-top-sites-experiment` clone.
2. Copy `tests/*` into `srcdir/testing/extensions/`, where `srcdir` is the
   top-level directory of your Firefox repo:

       $ cp tests/* srcdir/testing/extensions

3. Build the add-on zip file using `web-ext` as described above:

       $ web-ext build

   Or use a signed copy of the zip file.

4. Copy the zip file into `srcdir/testing/extensions/tests/browser`:

       $ cp web-ext-artifacts/urlbar_top_sites_experiment-1.0.0.zip srcdir/testing/extensions/tests/browser

5. Update `EXPECTED_ADDON_SIGNED_STATE` as necessary in
   `srcdir/testing/extensions/tests/browser/browser_urlbarTopSitesExtension.js`.
   If your zip file is unsigned, its value should be
   `AddonManager.SIGNEDSTATE_MISSING`. If it's signed, it should be
   `AddonManager.SIGNEDSTATE_PRIVILEGED`.

6. `cd` into your `srcdir`.
7. Run the test using `mach`:

       $ ./mach mochitest -f browser --appname <path to Firefox binary> testing/extensions/tests/browser/browser_urlbarTopSitesExtension.js

   If your Firefox repo itself contains the Firefox binary (because you ran
   `mach build`), you can omit the `--appname` argument.

[mozilla-central]: http://hg.mozilla.org/mozilla-central/
[mozilla-beta]: https://hg.mozilla.org/releases/mozilla-beta/

## Linting

This project uses the linting rules from mozilla-central. From your
`urlbar-top-sites-experiment` directory, run:

    $ npm install
    $ npx eslint .
