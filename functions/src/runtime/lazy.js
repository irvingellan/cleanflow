/** Loads a handler module on first use, so a cold instance loads only what its own Function needs. */
export function lazyHandler(load, name) {
  return async (...args) => (await load())[name](...args);
}
