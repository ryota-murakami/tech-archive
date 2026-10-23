# Agent instructions

## Publish an added article

Adding or updating HTML under `site/articles/` includes the commit and the push. The request to add or update the article is the authorization. GitHub Pages deploys from `main`, so the article is published only after `origin/main` has the file. Hold the commit or the push only when that same request explicitly says to hold it.

1. Save one standalone HTML file at `site/articles/YYYY-MM-DD-readable-slug.html`. Add `archive:*` metadata when the source has a title, date, or subject. The tag list is in `README.md` under "Add an article".
2. Run `pnpm check` and require it to pass. It regenerates gitignored `site/data/articles.json` for local preview. The Pages workflow rebuilds that file, so leave it out of the commit.
3. On `main`, commit only the article HTML from this request. Use one commit. Match the existing message style: `Add the <article> so the archive covers <why it belongs>.`
4. Push with `git push` so `origin/main` receives that commit. Keep git hooks enabled.

Done when the article path is clean and `git status -sb` shows `main` level with `origin/main`.

When the branch is not `main`, or `main` has diverged from `origin/main`, stop before the commit and report that. Use a normal push.
