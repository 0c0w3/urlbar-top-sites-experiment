/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI, XPCOMUtils */

XPCOMUtils.defineLazyModuleGetters(this, {
  Preferences: "resource://gre/modules/Preferences.jsm",
});

XPCOMUtils.defineLazyGetter(
  this,
  "defaultPreferences",
  () => new Preferences({ defaultBranch: true })
);

this.experiments_urlbar = class extends ExtensionAPI {
  onShutdown() {
    if (this._initialDefaultPrefs) {
      for (let [name, value] of this._initialDefaultPrefs.entries()) {
        defaultPreferences.set(name, value);
      }
    }
  }

  getAPI(context) {
    return {
      experiments: {
        urlbar: {
          setDefaultPref: (name, value) => {
            if (!this._initialDefaultPrefs) {
              this._initialDefaultPrefs = new Map();
            }
            if (!this._initialDefaultPrefs.has(name)) {
              this._initialDefaultPrefs.set(name, defaultPreferences.get(name));
            }
            defaultPreferences.set(name, value);
          },
          resetDefaultPref: name => {
            if (
              this._initialDefaultPrefs &&
              this._initialDefaultPrefs.has(name)
            ) {
              defaultPreferences.set(name, this._initialDefaultPrefs.get(name));
            }
          },
        },
      },
    };
  }
};
