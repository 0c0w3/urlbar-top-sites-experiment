"use strict";

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
  ],
};
