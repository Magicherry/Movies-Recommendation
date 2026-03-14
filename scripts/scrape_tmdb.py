import argparse
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
REQUIRED_ENRICHED_COLS = ("poster_url", "backdrop_url", "overview", "tmdb_id", "scraped_title")


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

def get_session():
    if not hasattr(thread_local, "session"):
        thread_local.session = requests.Session()
    return thread_local.session


def ensure_enriched_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure all enriched metadata columns exist."""
    for col in REQUIRED_ENRICHED_COLS:
        if col not in df.columns:
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

    clean_title, year, inner_names = parse_title_and_year(title_year)
    queries = [_normalize_title(clean_title)] + [_normalize_title(n) for n in inner_names if n.strip()]

    url = "https://api.themoviedb.org/3/search/movie"
    session = get_session()

    def do_search(query, with_year=True):
        params = {"api_key": API_KEY, "query": query}
        if with_year and year:
            params["primary_release_year"] = year
        try:
            resp = session.get(url, params=params, timeout=5)
            if resp.status_code != 200:
                return None
            data = resp.json()
            if data.get("results"):
                best = data["results"][0]
                tmdb_id = best.get("id")
                return {
                    "item_id": item_id,
                    "poster_url": f"https://image.tmdb.org/t/p/w500{best['poster_path']}" if best.get('poster_path') else "",
                    "backdrop_url": f"https://image.tmdb.org/t/p/w1280{best['backdrop_path']}" if best.get('backdrop_path') else "",
                    "overview": best.get('overview', ""),
                    "tmdb_id": str(tmdb_id) if tmdb_id is not None else "",
                    "scraped_title": (best.get("title") or "").strip(),
                }
        except Exception:
            pass
        return None

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
    }


def main():
    parser = argparse.ArgumentParser(description="Scrape TMDB for movie metadata.")
    parser.add_argument(
        "--artifacts-dir",
        type=str,
        default="models/artifacts",
        help="Artifacts root directory.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-scrape all movies in movies_enriched.csv and overwrite (refresh existing data).",
    )
    args = parser.parse_args()
    refresh = args.refresh
    artifacts_dir = Path(args.artifacts_dir)
    if not artifacts_dir.is_absolute():
        artifacts_dir = PROJECT_ROOT / artifacts_dir

    movies_path, enriched_source_path, enriched_write_path = resolve_data_paths(artifacts_dir)
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
        total = len(df)
        print(f"Scraping TMDB for {total} movies...", flush=True)
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(fetch_tmdb_info, row) for _, row in df.iterrows()]
            for idx, f in enumerate(futures):
                res = f.result()
                i = df.index[df["item_id"] == res["item_id"]].tolist()
                if i:
                    df.at[i[0], "poster_url"] = res.get("poster_url", "")
                    df.at[i[0], "backdrop_url"] = res.get("backdrop_url", "")
                    df.at[i[0], "overview"] = res.get("overview", "")
                    df.at[i[0], "tmdb_id"] = res.get("tmdb_id", "")
                    df.at[i[0], "scraped_title"] = res.get("scraped_title", "")
                if (idx + 1) % 100 == 0:
                    print(f"Processed {idx + 1}/{total}", flush=True)
        df.to_csv(enriched_write_path, index=False)
        print(f"Saved enriched data to {enriched_write_path}", flush=True)
        return

    print(f"Loading movies from {movies_path}", flush=True)
    movies_df = pd.read_csv(movies_path)

    existing_items = set()
    if enriched_source_path is not None and enriched_source_path.exists():
        existing_df = pd.read_csv(enriched_source_path)
        existing_df = ensure_enriched_columns(existing_df.fillna(""))
        existing_df.to_csv(enriched_write_path, index=False)
        existing_items = set(existing_df["item_id"])

    movies_to_fetch = movies_df[~movies_df["item_id"].isin(existing_items)]

    if len(movies_to_fetch) == 0:
        print("All movies enriched.", flush=True)
        return

    print(f"Scraping TMDB for {len(movies_to_fetch)} movies...", flush=True)
    is_first = not enriched_write_path.exists()

    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(fetch_tmdb_info, row) for _, row in movies_to_fetch.iterrows()]
        for idx, f in enumerate(futures):
            res = f.result()
            orig_row = movies_to_fetch[movies_to_fetch["item_id"] == res["item_id"]].iloc[0].to_dict()
            orig_row.update(res)
            for col in REQUIRED_ENRICHED_COLS:
                if col not in orig_row:
                    orig_row[col] = res.get(col, "") if col in res else ""
            pd.DataFrame([orig_row]).to_csv(enriched_write_path, mode="a", header=is_first, index=False)
            is_first = False
            if (idx + 1) % 100 == 0:
                print(f"Processed {idx + 1}/{len(movies_to_fetch)}", flush=True)

    print(f"Saved enriched data to {enriched_write_path}", flush=True)


if __name__ == "__main__":
    main()
