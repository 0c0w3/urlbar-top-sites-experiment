/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const BRANCHES = {
  CONTROL: "control",
  TREATMENT: "treatment",
};

const URLBAR_PROVIDER_NAME = "topSites";

/**
 * Logs a debug message, which the test harness interprets as a message the
 * add-on is sending to the test.  See head.js for info.
 *
 * @param {string} msg
 *   The message.
 */
function sendTestMessage(msg) {
  console.debug(browser.runtime.id, msg);
}

/**
 * Our `browser.urlbar.onBehaviorRequested` listener.
 */
function getProviderBehavior(query) {
  return query.searchString ? "inactive" : "restricting";
}

/**
 * Our `browser.urlbar.onResultsRequested` listener.
 */
async function getProviderResults(query) {
  let sites = await browser.topSites.get({
    newtab: true,
    includeFavicon: true,
    limit: 8,
  });

  // Convert the top sites to urlbar results.
  let results = [];
  for (let site of sites) {
    if (!site) {
      // `site` is undefined when there's a gap between tiles on newtab.
      continue;
    }
    switch (site.type) {
      case "url": {
        let result = {
          type: "url",
          source: "local",
          payload: {
            title: site.title,
            url: site.url,
            icon: site.favicon,
          },
        };
        // Results that are open in tabs should get the "tab" type and "tabs"
        // source so that they appear as switch-to-tab results.  Other results
        // that are bookmarks should get the "bookmarks" source so that they
        // appear as bookmarks.
        let tabs;
        try {
          // Work around a couple of browser.tabs annoyances:
          //
          // (1) Some URLs aren't valid match patterns for some reason.
          //     query() throws in those cases.  Just ignore it.
          //
          // (2) A match pattern that contains a fragment (#foo) doesn't match
          //     anything, even if the pattern is the same as a tab's URL.  To
          //     work around that, remove the fragment from the pattern.  That
          //     may give us multiple matching tabs, so then find the tab that
          //     matches the actual URL, if any.
          tabs = await browser.tabs.query({
            url: result.payload.url.replace(/#.*$/, ""),
          });
        } catch (err) {}
        if (tabs && tabs.find(tab => tab.url == site.url)) {
          result.type = "tab";
          result.source = "tabs";
        } else {
          let bookmarks = await browser.bookmarks.search({
            url: result.payload.url,
          });
          if (bookmarks.length) {
            result.source = "bookmarks";
          }
        }
        results.push(result);
        break;
      }
      case "search":
        results.push({
          type: "search",
          source: "search",
          payload: {
            title: site.title,
            keyword: site.title,
            keywordOffer: 2,
            query: "",
            icon: site.favicon,
          },
        });
        break;
      default:
        console.error("Unknown top site type:", site.type);
        break;
    }
  }
  return results;
}

/**
 * Resets all the state we set on enrollment in the study.
 *
 * @param {bool} isTreatmentBranch
 *   True if we were enrolled on the treatment branch, false if control.
 */
async function unenroll(isTreatmentBranch) {
  await browser.urlbar.engagementTelemetry.clear({});
  if (isTreatmentBranch) {
    await browser.urlbar.openViewOnFocus.clear({});
    await browser.urlbar.onBehaviorRequested.removeListener(
      getProviderBehavior
    );
    await browser.urlbar.onResultsRequested.removeListener(getProviderResults);
  }
  sendTestMessage("unenrolled");
}

/**
 * Sets up all appropriate state for enrollment in the study.
 *
 * @param {bool} isTreatmentBranch
 *   True if we are enrolling on the treatment branch, false if control.
 */
async function enroll(isTreatmentBranch) {
  await browser.normandyAddonStudy.onUnenroll.addListener(async () => {
    await unenroll(isTreatmentBranch);
  });

  // Enable urlbar engagement event telemetry.  See bugs 1559136 and 1570683.
  await browser.urlbar.engagementTelemetry.set({ value: true });

  if (isTreatmentBranch) {
    // Enable openViewOnFocus.
    await browser.urlbar.openViewOnFocus.set({ value: true });

    // Add our top-sites results provider.
    await browser.urlbar.onBehaviorRequested.addListener(
      getProviderBehavior,
      URLBAR_PROVIDER_NAME
    );
    await browser.urlbar.onResultsRequested.addListener(
      getProviderResults,
      URLBAR_PROVIDER_NAME
    );
  }

  sendTestMessage("enrolled");
}

(async function main() {
  // As a development convenience, act like we're enrolled in the treatment
  // branch if we're a temporary add-on.  onInstalled with details.temporary =
  // true will be fired in that case.  Add the listener now before awaiting the
  // study below to make sure we don't miss the event.
  let installPromise = new Promise(resolve => {
    browser.runtime.onInstalled.addListener(details => {
      resolve(details.temporary);
    });
  });

  // If we're enrolled in the study, set everything up, and then we're done.
  let study = await browser.normandyAddonStudy.getStudy();
  if (study) {
    // Sanity check the study.  This conditional should always be true.
    if (study.active && Object.values(BRANCHES).includes(study.branch)) {
      await enroll(study.branch == BRANCHES.TREATMENT);
    }
    sendTestMessage("ready");
    return;
  }

  // There's no study.  If installation happens, then continue with the
  // development convenience described above.
  installPromise.then(async isTemporaryInstall => {
    if (isTemporaryInstall) {
      console.debug("isTemporaryInstall");
      await enroll(true);
    }
    sendTestMessage("ready");
  });
})();
