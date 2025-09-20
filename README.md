# Netlify Astro Proxy JSON

This project provides a Netlify Function that proxies requests to FreeAstrologyAPI and returns JSON planetary data.

## Steps

1. Push repo to GitHub.
2. Connect Netlify, add env var: `FREE_ASTRO_API_KEY`.
3. Deploy site.
4. Use endpoint in GoDaddy HTML Embed snippet.

Endpoint example after deploy:
```
https://your-site-name.netlify.app/.netlify/functions/astro
```
