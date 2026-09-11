# Website

The one-page site is static HTML, CSS, and JavaScript. No dependencies or build step.

The bundled [VT323 typeface](https://github.com/google/fonts/tree/main/ofl/vt323) is distributed
under the [SIL Open Font License](fonts/OFL.txt).

Preview from the repository root:

```sh
python3 -m http.server 4173 --directory site
```

Open <http://localhost:4173>. Examples and clipboard interactions are local; the page never invokes
an agent or posts a review. All assets use relative URLs, so it also works at `/code-contracts/`.

## GitHub Pages

In the repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source.
After merging the site, `.github/workflows/pages.yml` deploys `site/` on relevant pushes to `main`.
It can also be run manually on `main`. The initial URL is <https://spolu.github.io/code-contracts/>.

Add your domain under **Settings → Pages → Custom domain**, then configure its DNS using
[GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
Enable **Enforce HTTPS** once the certificate is available. No hostname is embedded in the site.

## Vercel alternative

Import this repository with `site` as its root directory. Select **Other** as the framework preset,
override the build command, and leave it empty. Vercel serves the directory directly; configure
the domain in the project's domain settings. See [Vercel's static-site settings](https://vercel.com/docs/builds/configure-a-build#skip-build-step).
