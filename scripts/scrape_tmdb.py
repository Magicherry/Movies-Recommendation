import argparse
import json
import pandas as pd
import requests
import re
from concurrent.futures import ThreadPoolExecutor
import threading
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Load environment variables from .env file
load_dotenv(PROJECT_ROOT / ".env")

API_KEY = os.environ.get("TMDB_API_KEY")

if not API_KEY or API_KEY == "your_real_api_key_here":
    print("Error: TMDB_API_KEY not found in environment or .env file.")
    print("Please create a .env file in the project root with your TMDB API key:")
    print("TMDB_API_KEY=your_real_api_key_here")
    sys.exit(1)

thread_local = threading.local()
REQUIRED_ENRICHED_COLS = ("poster_url", "backdrop_url", "overview", "tmdb_id", "scraped_title", "cast", "directors")


def init_scrape_summary() -> dict[str, int]:
    return {
        "links_id_hit": 0,
        "title_search_hit": 0,
        "no_match": 0,
    }


def update_scrape_summary(summary: dict[str, int], match_source: str) -> None:
    if match_source == "links_id_hit":
        summary["links_id_hit"] += 1
    elif match_source == "title_search_hit":
        summary["title_search_hit"] += 1
    else:
        summary["no_match"] += 1


def print_scrape_summary(summary: dict[str, int]) -> None:
    print(
        "SCRAPE_SUMMARY "
        f"links_id_hit={summary['links_id_hit']} "
        f"title_search_hit={summary['title_search_hit']} "
        f"no_match={summary['no_match']}",
        flush=True,
    )


def _first_existing_path(candidates: list[Path]) -> Path | None:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def resolve_data_paths(artifacts_dir: Path) -> tuple[Path, Path | None, Path]:
    fallback_dir = artifacts_dir / "option1"
    option2_fallback_dir = artifacts_dir / "option2"

    movies_path = _first_existing_path(
        [artifacts_dir / "movies.csv", fallback_dir / "movies.csv", option2_fallback_dir / "movies.csv"]
    )
    if movies_path is None:
        raise FileNotFoundError(
            "No movies.csv found. Run training first: python -m scripts.train_and_evaluate"
        )

    enriched_source_path = _first_existing_path(
        [
            artifacts_dir / "movies_enriched.csv",
            fallback_dir / "movies_enriched.csv",
            option2_fallback_dir / "movies_enriched.csv",
        ]
    )
    enriched_write_path = artifacts_dir / "movies_enriched.csv"
    return movies_path, enriched_source_path, enriched_write_path


def resolve_links_path(
    artifacts_dir: Path,
    movies_path: Path,
    links_path_arg: str | None = None,
) -> Path | None:
    if links_path_arg:
        explicit = Path(links_path_arg)
        if not explicit.is_absolute():
            explicit = PROJECT_ROOT / explicit
        if not explicit.exists():
            raise FileNotFoundError(f"Specified links.csv path not found: {explicit}")
        return explicit

    # Always prefer the full MovieLens latest dataset for production scraping.
    candidates = [
        PROJECT_ROOT / "dataset" / "ml-latest" / "links.csv",
        movies_path.parent / "links.csv",
        PROJECT_ROOT / "frontend" / "ml-latest" / "ml-latest" / "links.csv",
    ]

    # Fallback: recover original dataset dir from split metadata if needed.
    split_meta_path = artifacts_dir / "splits" / "split_meta.json"
    if split_meta_path.exists():
        try:
            with open(split_meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            dataset_dir = meta.get("dataset_dir", "")
            if dataset_dir:
                candidates.append(Path(str(dataset_dir)) / "links.csv")
        except (OSError, json.JSONDecodeError):
            pass

    return _first_existing_path(candidates)


def load_links_tmdb_map(links_path: Path | None) -> pd.DataFrame:
    if links_path is None or not links_path.exists():
        return pd.DataFrame(columns=["item_id", "seed_tmdb_id"])

    frame = pd.read_csv(links_path)
    if "movieId" not in frame.columns or "tmdbId" not in frame.columns:
        return pd.DataFrame(columns=["item_id", "seed_tmdb_id"])

    out = frame.rename(columns={"movieId": "item_id", "tmdbId": "seed_tmdb_id"})[
        ["item_id", "seed_tmdb_id"]
    ].copy()
    out["item_id"] = pd.to_numeric(out["item_id"], errors="coerce")
    out["seed_tmdb_id"] = pd.to_numeric(out["seed_tmdb_id"], errors="coerce")
    out = out.dropna(subset=["item_id", "seed_tmdb_id"])
    out["item_id"] = out["item_id"].astype(int)
    out["seed_tmdb_id"] = out["seed_tmdb_id"].astype(int)
    out = out[out["seed_tmdb_id"] > 0]
    return out.drop_duplicates(subset=["item_id"], keep="first")


def attach_seed_tmdb_ids(frame: pd.DataFrame, links_map: pd.DataFrame) -> pd.DataFrame:
    if links_map.empty:
        frame = frame.copy()
        frame["seed_tmdb_id"] = pd.NA
        return frame
    return frame.merge(links_map, on="item_id", how="left")

def get_session():
    if not hasattr(thread_local, "session"):
        thread_local.session = requests.Session()
    return thread_local.session


def ensure_enriched_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure all enriched metadata columns exist."""
    for col in REQUIRED_ENRICHED_COLS:
        if col not in df.columns:
            if col in ["cast", "directors"]:
                df[col] = "[]"
            else:
                df[col] = ""
    return df

def _normalize_title(t):
    """Move ', The' / ', A' / ', An' to front."""
    t = t.strip()
    if t.endswith(", The"):
        t = "The " + t[:-5]
    elif t.endswith(", A"):
        t = "A " + t[:-3]
    elif t.endswith(", An"):
        t = "An " + t[:-4]
    return t


def parse_title_and_year(full_title):
    """Extract: clean title (no parens), year, and list of names inside non-year parentheses for alternative search."""
    s = str(full_title).strip()
    year = ""
    match = re.search(r'^(.*?)\s*\((\d{4})\)\s*$', s)
    if match:
        s = match.group(1).strip()
        year = match.group(2)
    inner_names = re.findall(r'\(([^)]*)\)', s)
    clean_title = re.sub(r'\s*\([^)]*\)\s*', ' ', s)
    clean_title = re.sub(r'\s+', ' ', clean_title).strip()
    return (clean_title, year, inner_names)


def fetch_tmdb_info(row):
    title_year = row['title']
    item_id = row['item_id']
    seed_tmdb_id = row.get("seed_tmdb_id", pd.NA)

    clean_title, year, inner_names = parse_title_and_year(title_year)
    queries = [_normalize_title(clean_title)] + [_normalize_title(n) for n in inner_names if n.strip()]

    session = get_session()
    search_url = "https://api.themoviedb.org/3/search/movie"

    def fetch_by_tmdb_id(tmdb_id: int, match_source: str = "links_id_hit"):
        detail_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
        try:
            resp = session.get(detail_url, params={"api_key": API_KEY, "append_to_response": "credits"}, timeout=5)
            if resp.status_code != 200:
                return None
            movie = resp.json()
            resolved_tmdb_id = movie.get("id")
            
            cast = []
            directors = []
            credits = movie.get("credits", {})
            if credits:
                for c in credits.get("cast", [])[:10]:
                    cast.append({
                        "id": c.get("id"),
                        "name": c.get("name"),
                        "character": c.get("character"),
                        "profile_path": c.get("profile_path")
                    })
                for c in credits.get("crew", []):
                    if c.get("job") == "Director":
                        directors.append({
                            "id": c.get("id"),
                            "name": c.get("name"),
                            "profile_path": c.get("profile_path")
                        })
                        
            return {
                "item_id": item_id,
                "poster_url": f"https://image.tmdb.org/t/p/w500{movie['poster_path']}" if movie.get("poster_path") else "",
                "backdrop_url": f"https://image.tmdb.org/t/p/w1280{movie['backdrop_path']}" if movie.get("backdrop_path") else "",
                "overview": movie.get("overview", ""),
                "tmdb_id": str(resolved_tmdb_id) if resolved_tmdb_id is not None else "",
                "scraped_title": (movie.get("title") or "").strip(),
                "cast": json.dumps(cast),
                "directors": json.dumps(directors),
                "match_source": match_source,
            }
        except Exception:
            return None

    def do_search(query, with_year=True):
        params = {"api_key": API_KEY, "query": query}
        if with_year and year:
            params["primary_release_year"] = year
        try:
            resp = session.get(search_url, params=params, timeout=5)
            if resp.status_code != 200:
                return None
            data = resp.json()
            if data.get("results"):
                best = data["results"][0]
                tmdb_id = best.get("id")
                if tmdb_id:
                    return fetch_by_tmdb_id(tmdb_id, match_source="title_search_hit")
        except Exception:
            pass
        return None

    if pd.notna(seed_tmdb_id):
        try:
            result = fetch_by_tmdb_id(int(seed_tmdb_id))
            if result:
                return result
        except (TypeError, ValueError):
            pass

    for q in queries:
        if not q:
            continue
        result = do_search(q, with_year=True)
        if result:
            return result
    for q in queries:
        if not q:
            continue
        result = do_search(q, with_year=False)
        if result:
            return result

    return {
        "item_id": item_id,
        "poster_url": "",
        "backdrop_url": "",
        "overview": "",
        "tmdb_id": "",
        "scraped_title": "",
        "cast": "[]",
        "directors": "[]",
        "match_source": "no_match",
    }


def main():
    parser = argparse.ArgumentParser(description="Scrape TMDB for movie metadata.")
    parser.add_argument(
        "--artifacts-dir",
        type=str,
        default=os.environ.get("STREAMX_DATA_DIR", "models/artifacts"),
        help="Artifacts root directory.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-scrape all movies in movies_enriched.csv and overwrite (refresh existing data).",
    )
    parser.add_argument(
        "--links-path",
        type=str,
        default=None,
        help="Optional path to MovieLens links.csv. If omitted, the script auto-detects it.",
    )
    args = parser.parse_args()
    refresh = args.refresh
    artifacts_dir = Path(args.artifacts_dir)
    if not artifacts_dir.is_absolute():
        artifacts_dir = PROJECT_ROOT / artifacts_dir

    movies_path, enriched_source_path, enriched_write_path = resolve_data_paths(artifacts_dir)
    links_path = resolve_links_path(artifacts_dir=artifacts_dir, movies_path=movies_path, links_path_arg=args.links_path)
    links_map = load_links_tmdb_map(links_path)
    if links_path is not None:
        print(f"Using links.csv from {links_path}", flush=True)
        print(f"Seed TMDB IDs available for {len(links_map)} movies", flush=True)
    else:
        print("links.csv not found. Falling back to title/year search only.", flush=True)
    enriched_write_path.parent.mkdir(parents=True, exist_ok=True)

    # Validate API key first
    test_url = "https://api.themoviedb.org/3/configuration"
    try:
        test_resp = requests.get(test_url, params={"api_key": API_KEY}, timeout=5)
        test_data = test_resp.json()
        if test_resp.status_code != 200 or test_data.get("success") is False:
            print(f"Error: Invalid TMDB API Key. {test_data.get('status_message', '')}")
            sys.exit(1)
    except Exception as e:
        print(f"Error: Failed to validate TMDB API Key. {str(e)}")
        sys.exit(1)

    if refresh:
        if enriched_source_path is None or not enriched_source_path.exists():
            print("Error: Refresh mode requires an existing movies_enriched.csv.", flush=True)
            sys.exit(1)
        print(f"Loading movies from {enriched_source_path} (refresh mode)", flush=True)
        df = pd.read_csv(enriched_source_path)
        df = df.fillna("")
        df = ensure_enriched_columns(df)
        df = attach_seed_tmdb_ids(df, links_map)
        summary = init_scrape_summary()
        total = len(df)
        print(f"Scraping TMDB for {total} movies...", flush=True)
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(fetch_tmdb_info, row) for _, row in df.iterrows()]
            for idx, f in enumerate(futures):
                res = f.result()
                update_scrape_summary(summary, str(res.get("match_source", "no_match")))
                i = df.index[df["item_id"] == res["item_id"]].tolist()
                if i:
                    df.at[i[0], "poster_url"] = res.get("poster_url", "")
                    df.at[i[0], "backdrop_url"] = res.get("backdrop_url", "")
                    df.at[i[0], "overview"] = res.get("overview", "")
                    df.at[i[0], "tmdb_id"] = res.get("tmdb_id", "")
                    df.at[i[0], "scraped_title"] = res.get("scraped_title", "")
                    df.at[i[0], "cast"] = res.get("cast", "[]")
                    df.at[i[0], "directors"] = res.get("directors", "[]")
                if (idx + 1) % 100 == 0:
                    print(f"Processed {idx + 1}/{total}", flush=True)
        df.drop(columns=["seed_tmdb_id"], errors="ignore").to_csv(enriched_write_path, index=False)
        print(f"Saved enriched data to {enriched_write_path}", flush=True)
        print_scrape_summary(summary)
        return

    print(f"Loading movies from {movies_path}", flush=True)
    movies_df = pd.read_csv(movies_path)
    movies_df = attach_seed_tmdb_ids(movies_df, links_map)

    existing_items = set()
    items_with_tmdb = set()
    existing_df: pd.DataFrame | None = None
    if enriched_source_path is not None and enriched_source_path.exists():
        existing_df = pd.read_csv(enriched_source_path)
        existing_df = ensure_enriched_columns(existing_df.fillna(""))
        existing_df.to_csv(enriched_write_path, index=False)
        existing_items = set(existing_df["item_id"])
        # Treat rows without tmdb_id as pending and continue scraping them in non-refresh mode.
        existing_df["tmdb_id"] = pd.to_numeric(existing_df["tmdb_id"], errors="coerce")
        items_with_tmdb = set(
            existing_df.loc[
                existing_df["tmdb_id"].notna() & (existing_df["tmdb_id"] > 0),
                "item_id",
            ].astype(int)
        )

    if existing_items:
        missing_rows = movies_df[~movies_df["item_id"].isin(existing_items)]
        pending_rows = movies_df[movies_df["item_id"].isin(existing_items - items_with_tmdb)]
        movies_to_fetch = pd.concat([missing_rows, pending_rows], ignore_index=True).drop_duplicates(
            subset=["item_id"], keep="first"
        )
    else:
        movies_to_fetch = movies_df

    if len(movies_to_fetch) == 0:
        print("All movies enriched.", flush=True)
        print_scrape_summary(init_scrape_summary())
        return

    print(f"Scraping TMDB for {len(movies_to_fetch)} movies...", flush=True)
    summary = init_scrape_summary()
    fetched_rows: list[dict] = []

    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(fetch_tmdb_info, row) for _, row in movies_to_fetch.iterrows()]
        for idx, f in enumerate(futures):
            res = f.result()
            update_scrape_summary(summary, str(res.get("match_source", "no_match")))
            orig_row = movies_to_fetch[movies_to_fetch["item_id"] == res["item_id"]].iloc[0].to_dict()
            orig_row.pop("seed_tmdb_id", None)
            orig_row.update(res)
            orig_row.pop("match_source", None)
            for col in REQUIRED_ENRICHED_COLS:
                if col not in orig_row:
                    if col in ["cast", "directors"]:
                        orig_row[col] = res.get(col, "[]") if col in res else "[]"
                    else:
                        orig_row[col] = res.get(col, "") if col in res else ""
            fetched_rows.append(orig_row)
            if (idx + 1) % 100 == 0:
                print(f"Processed {idx + 1}/{len(movies_to_fetch)}", flush=True)

    fetched_df = pd.DataFrame(fetched_rows)
    if existing_df is not None and not existing_df.empty:
        base_df = existing_df.drop(columns=["seed_tmdb_id"], errors="ignore")
        merged_df = pd.concat([base_df, fetched_df], ignore_index=True)
        merged_df = merged_df.drop_duplicates(subset=["item_id"], keep="last")
    else:
        merged_df = fetched_df

    merged_df.to_csv(enriched_write_path, index=False)
    print(f"Saved enriched data to {enriched_write_path}", flush=True)
    print_scrape_summary(summary)


if __name__ == "__main__":
    main()
