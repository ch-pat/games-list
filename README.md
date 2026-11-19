# Games I’ve Played

A three-page Hugo site for a personal video game catalogue: a home page, the complete games list, and a Hall of Fame containing only starred games.

The site uses a soft green palette, follows your system color preference by default, and offers a night mode toggle in the header. Your choice is saved in the browser.

## Editing the catalogue

Edit [`data/games.json`](data/games.json), the single source of game information. Each entry needs a title; all other fields are optional and omitted from the site when blank. For example:

```json
{
  "title": "Example Game",
  "platform": "PC",
  "play_year": 2024,
  "comment": "A game I still think about.",
  "favorite": true,
  "starred": true
}
```

The imported `started_on`, `beaten_on`, `play_time`, `platform`, and `comment` details are retained where present. Add `play_year`, `favorite`, and `starred` as you like. Use `platforms` instead of `platform` when a title has multiple platforms. Release dates can be set manually with `release_date` (or just `release_year`); the build-time lookup fills them where it finds a Wikidata publication date.

For a local editing webpage, run:

```sh
python scripts/edit_games.py
```

Open the printed address in your browser. The editor listens only on `127.0.0.1`; it lets you add and rename games, set the Played year (new games default to the current year), and edit comments, platforms, dates, play time, release information, favorites, Hall of Fame status, and additional metadata, then saves changes to `data/games.json`. Additional metadata is edited as a JSON object and can be used for fields not shown by dedicated controls. After adding or renaming games, run `python scripts/enrich_games.py` to update their cover and release-date lookups before building.

## Build locally

Install Hugo Extended and Python 3. Generate a SteamGridDB API key from your [SteamGridDB profile](https://www.steamgriddb.com/profile/preferences), then set it locally:

```sh
export STEAMGRIDDB_API_KEY="your-token"
python scripts/enrich_games.py
hugo server
```

Cover art comes from SteamGridDB's portrait-grid API, matched by exact game title. Release dates are looked up separately through Wikipedia and Wikidata. The API token is only used locally and is never included in the generated site.

After enrichment, commit the generated lookup data and cover images along with the catalogue:

```sh
git add data/games.json data/enrichment.json static/images/covers/
git commit -m "Update game catalog and cover art"
```

The script caches successful and missing lookups in `data/enrichment.json`, so later local runs only query new titles. GitHub Pages builds use the committed data and images and do not need the API token. If a title has not been enriched yet, CI reports that the local enrichment step must be run before committing. Games without a SteamGridDB match show a placeholder. If an image download is rate-limited, the script logs a warning and uses that SteamGridDB image URL instead. Existing manual `release_date` or `release_year` values take precedence over fetched values.

## GitHub Pages

Build and push the local site with:

```sh
hugo --minify --baseURL "https://OWNER.github.io/REPOSITORY/"
python scripts/deploy.py
```

The deploy script publishes the contents of `public/` at the root of the `gh-pages` branch. It preserves the branch's history and skips the push when the output is unchanged. The workflow in `.github/workflows/pages.yml` runs the same build and deploy steps on pushes to `main`.

In the repository's **Settings → Pages**, select **Deploy from a branch**, choose `gh-pages`, and select `/(root)`. For a custom base URL, define a repository Actions variable named `HUGO_BASE_URL`.


## Editing workflow

```sh
python scripts/edit_games.py  # Edit games with a local editor
python scripts/enrich_games.py  # Download cover art for any added games
hugo --minify --baseURL "https://OWNER.github.io/REPOSITORY/"
python scripts/deploy.py
```