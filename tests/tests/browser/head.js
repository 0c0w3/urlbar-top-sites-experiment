/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * This file implements a framework for writing browser chrome tests against
 * Normandy experiment add-on files.
 */

"use strict";

XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  AddonStudies: "resource://normandy/lib/AddonStudies.jsm",
  AddonTestUtils: "resource://testing-common/AddonTestUtils.jsm",
  NormandyTestUtils: "resource://testing-common/NormandyTestUtils.jsm",
  TelemetryTestUtils: "resource://testing-common/TelemetryTestUtils.jsm",
});

AddonTestUtils.initMochitest(this);

/**
 * {nsIFile} The add-on file under test.
 */
let gAddonFile;

/**
 * {object} The manifest of the add-on under test.
 */
let gAddonManifest;

/**
 * {integer} The expected signed state of the add-on under test, one of the
 * AddonManager.SIGNEDSTATE_* values.
 */
let gExpectedAddonSignedState;

/**
 * {string} The ID of the add-on under test.
 */
Object.defineProperty(this, "gAddonID", {
  get: () =>
    gAddonManifest.browser_specific_settings.gecko.id ||
    gAddonManifest.applications.gecko.id,
});

/**
 * {string} The version of the add-on under test.
 */
Object.defineProperty(this, "gAddonVersion", {
  get: () => gAddonManifest.version,
});

/**
 * You must call this to initialize your test.
 *
 * @param {string} addonFilePath
 *   The path to the add-on file under test, relative to `getTestFilePath`.  If
 *   the file is in the same directory as the test, this is just the basename.
 * @param {integer} expectedSignedState
 *   The signed state of the add-on file, one of the AddonManager.SIGNEDSTATE_*
 *   values.  While your add-on is in development and unsigned, pass
 *   AddonManager.SIGNEDSTATE_MISSING.  When your add-on is signed for release,
 *   pass AddonManager.SIGNEDSTATE_PRIVILEGED.
 */
async function initAddonTest(addonFilePath, expectedSignedState) {
  gAddonFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  gAddonFile.initWithPath(getTestFilePath(addonFilePath));

  // Load the add-on's manifest.  We'll get all the metadata from it so that
  // tests don't need to repeat it.
  let manifestURI = AddonTestUtils.getManifestURI(gAddonFile);
  let body = await fetch(manifestURI.spec);
  gAddonManifest = await body.json();
  info("Got add-on manifest: " + JSON.stringify(gAddonManifest, undefined, 2));

  gExpectedAddonSignedState = expectedSignedState;

  // Load our process script that listens for messages from the add-on.  There
  // doesn't seem to be a simple way for chrome to receive messages from actual
  // non-toy add-ons.  So we add a console-api-log-event observer in the child
  // process, listen for special log messages from the add-on, and forward them
  // to chrome.  The add-on should log a message with two arguments: its add-on
  // ID and the message type.
  let processScriptArgs = [gAddonID];
  function __processScript__(addonID) {
    let { Services } = ChromeUtils.import(
      "resource://gre/modules/Services.jsm"
    );
    Services.obs.addObserver((subject, topic, data) => {
      let msg = subject.wrappedJSObject;
      if (msg.addonId == addonID && msg.arguments.length == 2) {
        let [msgName, msgType] = msg.arguments;
        if (msgName == addonID) {
          Services.cpmm.sendAsyncMessage(msgName, msgType);
        }
      }
    }, "console-api-log-event");
  }
  Services.ppmm.loadProcessScript(
    "data:,(" +
      __processScript__.toString() +
      ")(..." +
      JSON.stringify(processScriptArgs) +
      ")",
    true
  );

  await SpecialPowers.pushPrefEnv({
    set: [
      // Show the extension's console messages in stdout and the browser
      // console.  This isn't required, but it's useful for debugging.
      ["devtools.console.stdout.content", true],
      ["devtools.browserconsole.contentMessages", true],
    ],
  });
}

/**
 * Waits for a message from the add-on.
 *
 * To send a message to the test, the add-on should call console.debug() or
 * another console logging function and pass two arguments: its add-on ID (which
 * it can get with `browser.runtime.id`) and the message.
 *
 * Your add-on and test can use whatever messages they need in order to properly
 * test the add-on.  For example, useful messages might be "enrolled" and
 * "unenrolled", which your add-on would send when it finishes enrolling and
 * unenrolling in your study.
 *
 * In addition, this file defines the following messages:
 *
 *   * ready: Should be sent by the add-on when its initialization is complete
 *     and it's ready to be tested.  See `withAddon`.
 *
 * @param {string} msg
 *   The expected message.
 */
async function awaitAddonMessage(msg) {
  await new Promise(resolve => {
    let listener = receivedMsg => {
      if (receivedMsg.data == msg) {
        Services.ppmm.removeMessageListener(gAddonID, listener);
        resolve();
      }
    };
    Services.ppmm.addMessageListener(gAddonID, listener);
  });
}

/**
 * Sets up a mock experiment study, calls your callback, and then removes the
 * study.
 *
 * @param {object} studyPartial
 *   A plain JS object that includes any of the recognized study properties.
 *   All properties are optional and will default to mock values.  For info on
 *   these properties, see AddonStudies.jsm and NormandyTestUtils.jsm.
 * @param {function} callback
 *   Your callback.  It will be passed the full study object, which is a plain
 *   JS object.
 */
async function withStudy(studyPartial, callback) {
  let study = NormandyTestUtils.factories.addonStudyFactory(
    Object.assign(
      {
        addonId: gAddonID,
        addonVersion: gAddonVersion,
      },
      studyPartial
    )
  );
  await AddonStudies.withStudies([study])(async studies => {
    await callback(studies[0]);
  })();
}

/**
 * Installs the add-on under test (which you should have specified by calling
 * `initAddonTest`), calls your callback, and then uninstalls the add-on.
 *
 * IMPORTANT: The add-on must send a "ready" message when it has finished
 * initialization and is ready to be tested.  This allows add-ons to perform any
 * async initialization they require before the test starts.  See
 * `awaitAddonMessage` for info on sending messages from the add-on.
 *
 * @param {function} callback
 *   Your callback.  It will be passed the add-on object, which is an instance
 *   of AddonWrapper (defined in XPIDatabase.jsm).
 */
async function withAddon(callback) {
  // If the add-on isn't signed, then as a convenience during development,
  // install it as a temporary add-on so that it can use privileged APIs.  If it
  // is signed, install it normally.
  let [, addon] = await Promise.all([
    awaitAddonMessage("ready"),
    gExpectedAddonSignedState === AddonManager.SIGNEDSTATE_MISSING
      ? AddonManager.installTemporaryAddon(gAddonFile)
      : AddonTestUtils.promiseInstallFile(gAddonFile).then(
          install => install.addon
        ),
  ]);

  Assert.strictEqual(
    addon.signedState,
    gExpectedAddonSignedState,
    "The add-on should have the expected signed state"
  );

  await callback();

  // If `withStudy` was called and there's an active study, Normandy will
  // automatically end the study when it sees that the add-on has been
  // uninstalled.  That's fine, but that automatic unenrollment will race the
  // unenrollment performed by `withStudy` and can cause database access errors
  // within Normandy.  To avoid that, wait here for the current study to end.
  let studyActive = (await AddonStudies.getAllActive()).some(
    study => study.addonId == gAddonID
  );

  await Promise.all([
    studyActive
      ? TestUtils.topicObserved("shield-study-ended")
      : Promise.resolve(),
    addon.uninstall(),
  ]);
}
