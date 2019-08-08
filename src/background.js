/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PROVIDER_NAME = "topSites";

// Enable urlbar engagement event telemetry.  See bugs 1559136 and 1570683.
browser.urlbar.engagementTelemetry.set({ value: true });

// Enable openViewOnFocus.
browser.urlbar.openViewOnFocus.set({ value: true });

// Add our top-sites results provider.
browser.urlbar.onBehaviorRequested.addListener(query => {
  return query.searchString ? "inactive" : "restricting";
}, PROVIDER_NAME);

browser.urlbar.onResultsRequested.addListener(async query => {
  let sites = await browser.topSites.get({
    newtab: true,
    includeFavicon: true,
    limit: 8,
  });

  // Convert the top sites to urlbar results.
  let results = [];
  for (let site of sites) {
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
          // (1) Some URLs aren't valid match patterns for some reason.  query()
          //     throws in those cases.  Just ignore it.
          // (2) A match pattern that contains a fragment (#foo) doesn't match
          //     anything, even if the pattern is the same as a tab's URL.  To
          //     work around that, remove the fragment from the pattern.  That
          //     may give us multiple matching tabs, so then find the tab that
          //     matches the actual URL, if any.
          tabs = await browser.tabs.query({
            url: result.payload.url.replace(/#.*$/, ""),
          });
        } catch (err) {}
        if (tabs.find(tab => tab.url == site.url)) {
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
}, PROVIDER_NAME);
