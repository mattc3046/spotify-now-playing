# Spotify Now Playing for iPad

A static Spotify album-art dashboard designed for an iPad on a stereo stand.

## Files

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `manifest.webmanifest`

## Setup summary

1. Create a public GitHub repository.
2. Upload these files.
3. Enable GitHub Pages from the `main` branch and repository root.
4. Your URL will usually be:
   `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY-NAME/`
5. In the Spotify Developer Dashboard, create an app with Web API access.
6. Add the exact GitHub Pages URL as the Redirect URI, including the trailing slash.
7. Copy the Spotify Client ID into `config.js`.
8. Commit the changed `config.js`.
9. Open the Pages URL and tap **Connect Spotify**.

## Important

- Spotify currently requires the app owner to have Spotify Premium for Development Mode Web API apps.
- Do not put a Spotify Client Secret in this project. This app uses Authorization Code with PKCE specifically so a secret is not stored in the browser.
- The site reads metadata. Spotify audio continues playing through your chosen Spotify Connect device.
