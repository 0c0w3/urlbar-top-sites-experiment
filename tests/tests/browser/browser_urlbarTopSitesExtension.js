/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// This file tests the urlbar top-sites experiment add-on.

"use strict";

XPCOMUtils.defineLazyModuleGetters(this, {
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.jsm",
  UrlbarPrefs: "resource:///modules/UrlbarPrefs.jsm",
  UrlbarProvidersManager: "resource:///modules/UrlbarProvidersManager.jsm",
  UrlbarTestUtils: "resource://testing-common/UrlbarTestUtils.jsm",
});

// The path of the add-on file relative to `getTestFilePath`.
const ADDON_PATH = "urlbar_top_sites_experiment-1.0.0.zip";

// Use SIGNEDSTATE_MISSING when testing an unsigned, in-development version of
// the add-on and SIGNEDSTATE_PRIVILEGED when testing the production add-on.
const EXPECTED_ADDON_SIGNED_STATE = AddonManager.SIGNEDSTATE_MISSING;
// const EXPECTED_ADDON_SIGNED_STATE = AddonManager.SIGNEDSTATE_PRIVILEGED;

const CONTROL_BRANCH = "control";
const TREATMENT_BRANCH = "treatment";

const EVENT_TELEMETRY_PREF = "eventTelemetry.enabled";

/**
 * Asserts that the urlbar view opens when the urlbar is clicked.
 */
async function assertAppliedTreatmentToUI(win = window) {
  Assert.ok(win.gURLBar.openViewOnFocus, "openViewOnFocus should be true");
  // We can remove this conditional once bug 1571161 is uplifted to 69.
  if ("openViewOnFocusForCurrentTab" in win.gURLBar) {
    Assert.ok(
      win.gURLBar.openViewOnFocusForCurrentTab,
      "openViewOnFocusForCurrentTab should be true"
    );
  }
  // Even with openViewOnFocus = true, the view should not open when the input
  // is focused programmatically.
  win.gURLBar.blur();
  win.gURLBar.focus();
  Assert.ok(!win.gURLBar.view.isOpen, "check urlbar panel is not open");
  Assert.ok(
    BrowserTestUtils.is_hidden(UrlbarTestUtils.getDropMarker(win)),
    "The dropmarker should be hidden"
  );
  win.gURLBar.blur();
  Assert.ok(
    BrowserTestUtils.is_hidden(UrlbarTestUtils.getDropMarker(win)),
    "The dropmarker should be hidden"
  );
  // Check the keyboard shortcut.
  await UrlbarTestUtils.promisePopupOpen(win, () => {
    win.document.getElementById("Browser:OpenLocation").doCommand();
  });
  win.gURLBar.blur();
  // Focus with the mouse.
  await UrlbarTestUtils.promisePopupOpen(win, () => {
    EventUtils.synthesizeMouseAtCenter(win.gURLBar.inputField, {});
  });
  win.gURLBar.blur();
}

/**
 * Asserts that the urlbar view does not open when the urlbar is clicked.
 */
async function assertNotAppliedTreatmentToUI(win = window) {
  Assert.ok(!win.gURLBar.openViewOnFocus, "openViewOnFocus should be false");
  // We can remove this conditional once bug 1571161 is uplifted to 69.
  if ("openViewOnFocusForCurrentTab" in win.gURLBar) {
    Assert.ok(
      !win.gURLBar.openViewOnFocusForCurrentTab,
      "openViewOnFocusForCurrentTab should be false"
    );
  }
  // The view should not open when the input is focused programmatically.
  win.gURLBar.blur();
  win.gURLBar.focus();
  Assert.ok(!win.gURLBar.view.isOpen, "check urlbar panel is not open");
  Assert.ok(
    BrowserTestUtils.is_visible(UrlbarTestUtils.getDropMarker(win)),
    "The dropmarker should be visible"
  );
  win.gURLBar.blur();
  Assert.ok(
    BrowserTestUtils.is_visible(UrlbarTestUtils.getDropMarker(win)),
    "The dropmarker should be visible"
  );
  // Check the keyboard shortcut.
  win.document.getElementById("Browser:OpenLocation").doCommand();
  Assert.ok(!win.gURLBar.view.isOpen, "check urlbar panel is not open");
  win.gURLBar.blur();
  // Focus with the mouse.
  EventUtils.synthesizeMouseAtCenter(win.gURLBar.inputField, {});
  Assert.ok(!win.gURLBar.view.isOpen, "check urlbar panel is not open");
  win.gURLBar.blur();
}

/**
 * Asserts that everything is set up properly to reflect enrollment in the
 * study.
 *
 * @param {bool} isTreatmentBranch
 *   True if the enrolled branch is treatment and false if control.
 */
async function assertEnrolled(isTreatmentBranch) {
  Assert.equal(UrlbarPrefs.get(EVENT_TELEMETRY_PREF), true);
  if (isTreatmentBranch) {
    await assertAppliedTreatmentToUI();
  } else {
    await assertNotAppliedTreatmentToUI();
  }
}

/**
 * Asserts that everything is set up properly to reflect no enrollment in the
 * study.
 */
async function assertNotEnrolled() {
  Assert.equal(UrlbarPrefs.get(EVENT_TELEMETRY_PREF), false);
  await assertNotAppliedTreatmentToUI();
}

add_task(async function init() {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();

  // Add a visit that will show up at index = 1 in the top-sites view.
  await PlacesTestUtils.addVisits([
    {
      uri: "http://example.com/",
      transition: PlacesUtils.history.TRANSITIONS.TYPED,
    },
  ]);

  await initAddonTest(ADDON_PATH, EXPECTED_ADDON_SIGNED_STATE);

  await SpecialPowers.pushPrefEnv({
    set: [
      // Show the Amazon search shortcut.  Not really important, but actual
      // users will see it and this pref will be true for them.
      ["browser.urlbar.suggest.searches", true],

      // The top-sites pref is empty by default, so nothing would show up in the
      // view except for history and bookmarks.  Use the top sites shipped in
      // Firefox.
      [
        "browser.newtabpage.activity-stream.default.sites",
        "https://www.youtube.com/,https://www.facebook.com/,https://www.amazon.com/,https://www.reddit.com/,https://www.wikipedia.org/,https://twitter.com/",
      ],
      // Toggle the feed off and on as a workaround to read the new prefs.
      ["browser.newtabpage.activity-stream.feeds.topsites", false],
      ["browser.newtabpage.activity-stream.feeds.topsites", true],
      [
        "browser.newtabpage.activity-stream.improvesearch.topSiteSearchShortcuts",
        true,
      ],
    ],
  });

  // openViewOnFocus doesn't apply to about:newtab.  Open a normal web page for
  // our tests to guarantee that openViewOnFocus applies.
  let tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: "http://test/",
  });
  registerCleanupFunction(() => {
    BrowserTestUtils.removeTab(tab);
  });
});

add_task(async function treatment() {
  await withStudy({ branch: TREATMENT_BRANCH }, async () => {
    await withAddon(async () => {
      await assertEnrolled(true);
    });
  });
});

add_task(async function control() {
  await withStudy({ branch: CONTROL_BRANCH }, async () => {
    await withAddon(async () => {
      await assertEnrolled(false);
    });
  });
});

add_task(async function unenrollAfterInstall() {
  await withStudy({ branch: TREATMENT_BRANCH }, async study => {
    await withAddon(async () => {
      await assertEnrolled(true);
      await Promise.all([
        awaitAddonMessage("unenrolled"),
        AddonStudies.markAsEnded(study),
      ]);
      await assertNotEnrolled();
    });
  });
});

add_task(async function unenrollBeforeInstall() {
  await withStudy({ branch: TREATMENT_BRANCH }, async study => {
    await AddonStudies.markAsEnded(study);
    await withAddon(async () => {
      await assertNotEnrolled();
    });
  });
});

add_task(async function noBranch() {
  await withStudy({}, async () => {
    await withAddon(async () => {
      await assertNotEnrolled();
    });
  });
});

add_task(async function unrecognizedBranch() {
  await withStudy({ branch: "bogus" }, async () => {
    await withAddon(async () => {
      await assertNotEnrolled();
    });
  });
});

add_task(async function noStudy() {
  if (EXPECTED_ADDON_SIGNED_STATE == AddonManager.SIGNEDSTATE_MISSING) {
    info("This test doesn't apply to an unsigned add-on, skipping.");
    return;
  }
  await withAddon(async addon => {
    await assertNotEnrolled();
  });
});

add_task(async function unrelatedStudy() {
  if (EXPECTED_ADDON_SIGNED_STATE == AddonManager.SIGNEDSTATE_MISSING) {
    info("This test doesn't apply to an unsigned add-on, skipping.");
    return;
  }
  await withStudy(
    {
      addonId: "someOtherAddon@mozilla.org",
      branch: TREATMENT_BRANCH,
    },
    async () => {
      await withAddon(async () => {
        await assertNotEnrolled();
      });
    }
  );
});

// Checks engagement event telemetry while enrolled in the study on the
// treatment branch.  We have a separate comprehensive test in the tree for this
// telemetry, so we don't test everything here.  We only make sure that the
// telemetry is indeed recorded.
add_task(async function telemetryTreatment() {
  Services.telemetry.clearEvents();
  await withStudy({ branch: TREATMENT_BRANCH }, async () => {
    await withAddon(async () => {
      // Click the input, wait for the view to open, click the result at index
      // 1, which should be the visit we added in `init`.
      EventUtils.synthesizeMouseAtCenter(gURLBar.inputField, {});
      let row = await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);
      EventUtils.synthesizeMouseAtCenter(row, {});
      await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);

      TelemetryTestUtils.assertEvents([
        {
          category: "urlbar",
          method: "engagement",
          object: "click",
          value: "topsites",
          extra: {
            elapsed: val => parseInt(val) > 0,
            numChars: "0",
            selIndex: "1",
            selType: "history",
          },
        },
      ]);
    });
  });
});

// Checks engagement event telemetry while enrolled in the study on the control
// branch.
add_task(async function telemetryControl() {
  Services.telemetry.clearEvents();
  await withStudy({ branch: CONTROL_BRANCH }, async () => {
    await withAddon(async () => {
      // Click the history dropmarker, wait for the view to open, click the
      // result at index 1, which should be the visit we added in `init`.
      await UrlbarTestUtils.promisePopupOpen(window, () => {
        EventUtils.synthesizeMouseAtCenter(
          UrlbarTestUtils.getDropMarker(window),
          {}
        );
      });
      let row = await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);
      EventUtils.synthesizeMouseAtCenter(row, {});
      await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);

      // This is actually the same telemetry that should have been recorded on
      // the treatment branch.  (See the treatment-branch test above.)  We will
      // be able to distinguish between treatment and control telemetry in the
      // telemetry pings.
      TelemetryTestUtils.assertEvents([
        {
          category: "urlbar",
          method: "engagement",
          object: "click",
          value: "topsites",
          extra: {
            elapsed: val => parseInt(val) > 0,
            numChars: "0",
            selIndex: "1",
            selType: "history",
          },
        },
      ]);
    });
  });
});
