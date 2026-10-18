/** Prevent admin-authored text from closing an HTML script element. */
export const serializeJsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
