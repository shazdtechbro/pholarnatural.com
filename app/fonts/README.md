# Local fonts

Latin, normal-style variable WOFF2 files served by `next/font/local` from the
root layout. No Google Fonts connection or package dependency is required at
build time or in the browser. Both files total about 75 KiB before HTTP headers.

Downloaded from the npm registry using `npm pack` (package integrity verified):

- `@fontsource-variable/playfair-display@5.3.0`, Google Fonts revision v40.
- `@fontsource-variable/montserrat@5.3.0`, Google Fonts revision v31.

The original SIL Open Font License and copyright notices for each family are
included alongside the font files. Preserve them when redistributing the fonts.

To refresh, download the desired Fontsource package version, extract its
`files/<family>-latin-wght-normal.woff2` and `LICENSE`, and run the production
build. Keep filenames aligned with the paths in `app/layout.tsx`.
