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
    // Reset the default prefs.  This is necessary because
    // ExtensionPreferencesManager doesn't properly reset prefs set on the
    // default branch.
    if (this._initialDefaultPrefs) {
      for (let [name, value] of this._initialDefaultPrefs.entries()) {
        defaultPreferences.set(name, value);
      }
    }
  }

  _getDefaultSettingsAPI(extensionId, name, pref) {
    return {
      get: details => {
        return { value: Preferences.get(pref) };
      },
      set: details => {
        if (!this._initialDefaultPrefs) {
          this._initialDefaultPrefs = new Map();
        }
        if (!this._initialDefaultPrefs.has(pref)) {
          this._initialDefaultPrefs.set(pref, defaultPreferences.get(pref));
        }
        defaultPreferences.set(pref, details.value);
        return true;
      },
      clear: details => {
        if (this._initialDefaultPrefs && this._initialDefaultPrefs.has(pref)) {
          defaultPreferences.set(pref, this._initialDefaultPrefs.get(pref));
        }
      },
    };
  }

  getAPI(context) {
    return {
      experiments: {
        urlbar: {
          engagementTelemetry: this._getDefaultSettingsAPI(
            context.extension.id,
            "engagementTelemetry",
            "browser.urlbar.eventTelemetry.enabled"
          ),
          openViewOnFocus: this._getDefaultSettingsAPI(
            context.extension.id,
            "openViewOnFocus",
            "browser.urlbar.openViewOnFocus"
          ),
        },
      },
    };
  }
};
