#!/usr/bin/env python3
"""Fetch SteamGridDB game covers and Wikimedia release years."""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sys
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
GAMES_FILE = ROOT / "data" / "games.json"
OUTPUT_FILE = ROOT / "data" / "enrichment.json"
COVERS_DIR = ROOT / "static" / "images" / "covers"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
STEAMGRIDDB_API = "https://www.steamgriddb.com/api/v2"
USER_AGENT = "GamesListSite/1.0 (build-time game metadata enrichment)"
RETRYABLE_STATUSES = {429, 500, 502, 503, 504}


class RateLimitedCoverDownload(RuntimeError):
    pass


def retry_delay(error, attempt):
    value = error.headers.get("Retry-After", "")
    try:
        requested = float(value)
    except ValueError:
        try:
            requested = (
                parsedate_to_datetime(value) - datetime.now(timezone.utc)
            ).total_seconds()
        except (TypeError, ValueError, OverflowError):
            requested = 0
    return max(requested, 2**attempt)


def request_json(url, params):
    request_url = f"{url}?{urlencode(params)}"
    request = Request(request_url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urlopen(request, timeout=30) as response:
                data = json.load(response)
                if "error" in data:
                    raise RuntimeError(f"Wikimedia API error from {url}: {data['error']}")
                return data
        except HTTPError as error:
            if error.code not in RETRYABLE_STATUSES or attempt == 4:
                raise RuntimeError(f"Request failed for {url}: {error}") from error
            delay = retry_delay(error, attempt)
            print(f"Wikimedia API returned HTTP {error.code}; retrying in {delay:g}s.")
            time.sleep(delay)
        except (URLError, TimeoutError) as error:
            if attempt == 4:
                raise RuntimeError(f"Request failed for {url}: {error}") from error
            delay = 2**attempt
            print(f"Wikimedia API request failed; retrying in {delay}s: {error}")
            time.sleep(delay)
    raise RuntimeError(f"Request failed after retries for {url}")


def request_bytes(url):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urlopen(request, timeout=45) as response:
                content_type = response.headers.get_content_type()
                if not content_type.startswith("image/"):
                    raise RuntimeError(f"Expected an image from {url}, got {content_type}")
                return response.read()
        except HTTPError as error:
            if error.code == 429:
                raise RateLimitedCoverDownload(
                    f"SteamGridDB rate-limited the cover download: {url}"
                ) from error
            if error.code not in RETRYABLE_STATUSES or attempt == 4:
                raise RuntimeError(f"Cover download failed for {url}: {error}") from error
            delay = retry_delay(error, attempt)
            print(f"Cover host returned HTTP {error.code}; retrying in {delay:g}s.")
            time.sleep(delay)
        except (URLError, TimeoutError) as error:
            if attempt == 4:
                raise RuntimeError(f"Cover download failed for {url}: {error}") from error
            delay = 2**attempt
            print(f"Cover download failed; retrying in {delay}s: {error}")
            time.sleep(delay)
    raise RuntimeError(f"Cover download failed after retries for {url}")


def steamgriddb_json(api_key, endpoint, params=None):
    url = f"{STEAMGRIDDB_API}/{endpoint}"
    if params:
        url = f"{url}?{urlencode(params)}"
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "User-Agent": USER_AGENT,
        },
    )
    for attempt in range(5):
        try:
            with urlopen(request, timeout=30) as response:
                data = json.load(response)
                if not data.get("success", False):
                    raise RuntimeError("SteamGridDB returned an unsuccessful response.")
                return data
        except HTTPError as error:
            if error.code == 404:
                return {"success": True, "data": []}
            if error.code == 401:
                raise RuntimeError(
                    "SteamGridDB authentication failed; check STEAMGRIDDB_API_KEY."
                ) from error
            if error.code not in RETRYABLE_STATUSES or attempt == 4:
                raise RuntimeError(
                    f"SteamGridDB request failed with HTTP {error.code}."
                ) from error
            delay = retry_delay(error, attempt)
            print(f"SteamGridDB returned HTTP {error.code}; retrying in {delay:g}s.")
            time.sleep(delay)
        except (URLError, TimeoutError) as error:
            if attempt == 4:
                raise RuntimeError(f"SteamGridDB request failed: {error}") from error
            delay = 2**attempt
            print(f"SteamGridDB request failed; retrying in {delay}s: {error}")
            time.sleep(delay)
    raise RuntimeError("SteamGridDB request failed after retries.")


def normalized_title(title):
    title = title.casefold()
    title = "".join(
        character
        for character in unicodedata.normalize("NFKD", title)
        if not unicodedata.combining(character)
    )
    return " ".join(re.sub(r"[^\w]+", " ", title).split())


def steamgriddb_cover(title, api_key):
    search = steamgriddb_json(
        api_key,
        f"search/autocomplete/{quote(title, safe='')}",
    )
    matching_games = [
        game
        for game in search.get("data", [])
        if normalized_title(game.get("name", "")) == normalized_title(title)
    ]
    if not matching_games:
        return None

    for game in matching_games:
        grids = steamgriddb_json(
            api_key,
            f"grids/game/{game['id']}",
            {
                "dimensions": "342x482,600x900",
                "types": "static",
                "nsfw": "false",
                "humor": "false",
                "limit": 10,
            },
        )
        candidates = [
            grid
            for grid in grids.get("data", [])
            if isinstance(grid.get("url"), str)
            and urlsplit(grid["url"]).scheme == "https"
            and urlsplit(grid["url"]).hostname
            and (
                urlsplit(grid["url"]).hostname == "steamgriddb.com"
                or urlsplit(grid["url"]).hostname.endswith(".steamgriddb.com")
            )
        ]
        if candidates:
            image = max(candidates, key=lambda grid: grid.get("score") or 0)
            return {
                "game_id": game["id"],
                "image_url": image["url"],
            }
    return None


def batches(values, size=40):
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def wikipedia_items(titles):
    result = {}
    for title_batch in batches(titles):
        data = request_json(
            WIKIPEDIA_API,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "prop": "pageprops",
                "titles": "|".join(title_batch),
            },
        )
        aliases = {}
        for key in ("normalized", "redirects"):
            aliases.update(
                (entry["from"], entry["to"])
                for entry in data.get("query", {}).get(key, [])
            )
        pages = {
            page["title"].casefold(): page.get("pageprops", {}).get("wikibase_item")
            for page in data.get("query", {}).get("pages", [])
        }
        for title in title_batch:
            resolved = title
            while resolved in aliases:
                resolved = aliases[resolved]
            item = pages.get(resolved.casefold())
            if item:
                result[title] = item
    return result


def wikidata_claims(item_ids):
    claims = {}
    for id_batch in batches(sorted(set(item_ids))):
        data = request_json(
            WIKIDATA_API,
            {
                "action": "wbgetentities",
                "format": "json",
                "props": "claims",
                "ids": "|".join(id_batch),
            },
        )
        for item_id, entity in data.get("entities", {}).items():
            entity_claims = entity.get("claims", {})
            date_claims = entity_claims.get("P577", [])
            release_year = None
            date_value = None
            for claim in date_claims:
                candidate = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
                if not isinstance(candidate, dict):
                    continue
                time_value = candidate.get("time", "")
                if not isinstance(time_value, str):
                    continue
                match = re.match(r"^[+-]?(\d{4})", time_value)
                if match:
                    release_year = int(match.group(1))
                    date_value = candidate
                    break
            release_date = None
            if release_year:
                time_value = date_value["time"]
                precision = date_value.get("precision", 9)
                release_date = time_value[1:11] if precision >= 11 else (
                    time_value[1:8] if precision == 10 else str(release_year)
                )
            claims[item_id] = {
                "release_date": release_date,
                "release_year": release_year,
            }
    return claims


def cover_path(title, image_url):
    extension = Path(urlsplit(image_url).path).suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
        extension = ".jpg"
    name = sha256(f"steamgriddb:{title}".encode("utf-8")).hexdigest()[:16]
    return f"images/covers/{name}{extension}"


def remove_unused_covers(enrichment, titles):
    used_files = {
        Path(entry["cover"]).name
        for title in titles
        if (entry := enrichment.get(title, {})).get("cover")
        and not entry["cover"].startswith("https://")
        and entry["cover"].startswith("images/covers/")
    }
    for path in COVERS_DIR.iterdir():
        if path.is_file() and path.name not in used_files:
            path.unlink()


def main():
    if not GAMES_FILE.is_file():
        raise RuntimeError(f"Game configuration not found: {GAMES_FILE}")

    games = json.loads(GAMES_FILE.read_text(encoding="utf-8"))
    titles = list(dict.fromkeys(game["title"] for game in games))
    if OUTPUT_FILE.is_file():
        enrichment = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    else:
        enrichment = {}
    for entry in enrichment.values():
        if entry.get("cover_provider") != "SteamGridDB":
            for key in (
                "cover",
                "cover_url",
                "cover_source",
                "cover_artist",
                "cover_license",
                "cover_license_url",
                "cover_provider",
            ):
                entry.pop(key, None)
        elif entry.get("cover") and not entry["cover"].startswith("https://"):
            entry["cover"] = entry["cover"].lstrip("/")

    pending_release_titles = [
        title
        for title in titles
        if not enrichment.get(title, {}).get("_lookup_complete")
    ]
    pending_cover_titles = [
        title
        for title in titles
        if not enrichment.get(title, {}).get("_cover_lookup_complete")
    ]
    api_key = os.environ.get("STEAMGRIDDB_API_KEY", "").strip()
    if pending_cover_titles and not api_key:
        raise RuntimeError(
            "Missing STEAMGRIDDB_API_KEY. Set it in your local environment, "
            "run the enrichment script, then commit the generated covers and metadata."
        )

    print(
        f"Reusing release metadata for "
        f"{len(titles) - len(pending_release_titles)} games; "
        f"fetching {len(pending_cover_titles)} game covers."
    )
    title_to_item = (
        wikipedia_items(pending_release_titles) if pending_release_titles else {}
    )
    item_data = wikidata_claims(title_to_item.values()) if title_to_item else {}
    title_data = {
        title: item_data[item]
        for title, item in title_to_item.items()
        if item in item_data
    }
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    for title in pending_release_titles:
        data = title_data.get(title, {})
        entry = enrichment.setdefault(title, {})
        entry["_lookup_complete"] = True
        if data.get("release_date"):
            entry["release_date"] = data["release_date"]
        if data.get("release_year"):
            entry["release_year"] = data["release_year"]

    for title in pending_cover_titles:
        entry = enrichment.setdefault(title, {})
        entry["_cover_lookup_complete"] = True
        cover = steamgriddb_cover(title, api_key)
        if cover:
            local_path = cover_path(title, cover["image_url"])
            entry.update(
                {
                    "cover": local_path,
                    "cover_url": cover["image_url"],
                    "cover_source": (
                        f"https://www.steamgriddb.com/game/{cover['game_id']}"
                    ),
                    "cover_provider": "SteamGridDB",
                }
            )
        else:
            for key in (
                "cover",
                "cover_url",
                "cover_source",
                "cover_provider",
            ):
                entry.pop(key, None)

    cover_jobs = [
        (title, entry["cover"], entry["cover_url"])
        for title, entry in enrichment.items()
        if title in titles
        and entry.get("cover_provider") == "SteamGridDB"
        and entry.get("cover_url")
        and not entry.get("cover", "").startswith("https://")
        and not (ROOT / "static" / entry["cover"].lstrip("/")).is_file()
    ]

    rate_limited_covers = 0
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(request_bytes, url): (title, path, url)
            for title, path, url in cover_jobs
        }
        for future in as_completed(futures):
            title, path, url = futures[future]
            try:
                image_bytes = future.result()
            except RateLimitedCoverDownload as error:
                enrichment[title]["cover"] = url
                rate_limited_covers += 1
                print(f"Warning: {error}; using the SteamGridDB URL on the site.")
                continue
            target = ROOT / "static" / path.lstrip("/")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(image_bytes)
            print(f"Fetched {path}")

    remove_unused_covers(enrichment, titles)
    OUTPUT_FILE.write_text(
        json.dumps(enrichment, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote cached metadata for {len(enrichment)} games to {OUTPUT_FILE}.")
    if rate_limited_covers:
        print(
            f"Warning: {rate_limited_covers} covers were rate-limited and will "
            "load from SteamGridDB."
        )


if __name__ == "__main__":
    try:
        main()
    except (json.JSONDecodeError, KeyError, RuntimeError) as error:
        print(f"Game metadata enrichment failed: {error}", file=sys.stderr)
        sys.exit(1)
