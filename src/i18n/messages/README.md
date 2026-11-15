# Message parts

Each file here is one **part** of the message catalog: an object with the `en`, `pt` and `es` texts of one area.
`index.js` merges the parts, in order, into the single `messages` object used by `../translations.js`.

- **Order matters.** A later part may override a key from an earlier one. Never reorder `parts`.
- **New copy goes in a part**, new or existing, with all three languages. Never add texts to `translations.js`.
- A new part is imported last and appended last to `parts` in `index.js`.
- `../messageCatalog.test.js` fingerprints every key and text. Update it deliberately, with
  `npx vitest run -u src/i18n/messageCatalog.test.js`, only when texts are meant to change.
