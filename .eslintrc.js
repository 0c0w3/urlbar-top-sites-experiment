"use strict";

const browserTestConfig = require(
  "eslint-plugin-mozilla/lib/configs/browser-test.js"
);

module.exports = {
  extends: [
    "plugin:mozilla/recommended"
  ],
  plugins: [
    "mozilla"
  ],
  overrides: [
    {
      files: [
        "src/background.js",
      ],
      globals: {
        "browser": true,
      },
    },
    // Copied and modified from mozilla-central/.eslintrc.js
    {
      "files": [
        "tests/**/browser/**",
      ],
      ...browserTestConfig,
    },
  ],
};
