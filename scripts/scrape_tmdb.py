import pandas as pd
import requests
import re
from concurrent.futures import ThreadPoolExecutor
import threading
import os
from pathlib import Path

API_KEY = "b1febb1073ae2d729ed55831afee85fc"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
MOVIES_PATH = PROJECT_ROOT / "models" / "artifacts" / "movies.csv"
ENRICHED_PATH = PROJECT_ROOT / "models" / "artifacts" / "movies_enriched.csv"

thread_local = threading.local()

def get_session():
    if not hasattr(thread_local, "session"):
        thread_local.session = requests.Session()
    return thread_local.session

def fetch_tmdb_info(row):
    title_year = row['title']
    item_id = row['item_id']
    
    match = re.search(r'^(.*?)\s*\((\d{4})\)$', str(title_year))
    if match:
        title = match.group(1).strip()
        year = match.group(2)
    else:
        title = str(title_year)
        year = ""

    if title.endswith(", The"):
        title = "The " + title[:-5]
    elif title.endswith(", A"):
        title = "A " + title[:-3]
    elif title.endswith(", An"):
        title = "An " + title[:-4]

    url = "https://api.themoviedb.org/3/search/movie"
    params = {
        "api_key": API_KEY,
        "query": title,
    }
    if year:
        params["primary_release_year"] = year

    session = get_session()

    try:
        resp = session.get(url, params=params, timeout=5)
        data = resp.json()
        if data.get("results"):
            best = data["results"][0]
            return {
                "item_id": item_id,
                "poster_url": f"https://image.tmdb.org/t/p/w500{best['poster_path']}" if best.get('poster_path') else "",
                "backdrop_url": f"https://image.tmdb.org/t/p/w1280{best['backdrop_path']}" if best.get('backdrop_path') else "",
                "overview": best.get('overview', "")
            }
        else:
            if year:
                del params["primary_release_year"]
                resp = session.get(url, params=params, timeout=5)
                data = resp.json()
                if data.get("results"):
                    best = data["results"][0]
                    return {
                        "item_id": item_id,
                        "poster_url": f"https://image.tmdb.org/t/p/w500{best['poster_path']}" if best.get('poster_path') else "",
                        "backdrop_url": f"https://image.tmdb.org/t/p/w1280{best['backdrop_path']}" if best.get('backdrop_path') else "",
                        "overview": best.get('overview', "")
                    }
    except Exception as e:
        pass
        
    return {
        "item_id": item_id,
        "poster_url": "",
        "backdrop_url": "",
        "overview": ""
    }

def main():
    print(f"Loading movies from {MOVIES_PATH}", flush=True)
    movies_df = pd.read_csv(MOVIES_PATH)
    
    existing_items = set()
    if ENRICHED_PATH.exists():
        existing_df = pd.read_csv(ENRICHED_PATH)
        existing_items = set(existing_df['item_id'])
    
    movies_to_fetch = movies_df[~movies_df['item_id'].isin(existing_items)]
    
    if len(movies_to_fetch) == 0:
        print("All movies enriched.", flush=True)
        return
        
    print(f"Scraping TMDB for {len(movies_to_fetch)} movies...", flush=True)
    
    results = []
    # Open file for appending
    is_first = not ENRICHED_PATH.exists()
    
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(fetch_tmdb_info, row) for _, row in movies_to_fetch.iterrows()]
        
        for idx, f in enumerate(futures):
            res = f.result()
            # We must merge it with the original row immediately to save incrementally
            orig_row = movies_to_fetch[movies_to_fetch['item_id'] == res['item_id']].iloc[0].to_dict()
            orig_row.update(res)
            
            # Save to CSV incrementally
            pd.DataFrame([orig_row]).to_csv(ENRICHED_PATH, mode='a', header=is_first, index=False)
            is_first = False
            
            if (idx + 1) % 100 == 0:
                print(f"Processed {idx + 1}/{len(movies_to_fetch)}", flush=True)

    print(f"Saved enriched data to {ENRICHED_PATH}", flush=True)

if __name__ == "__main__":
    main()
