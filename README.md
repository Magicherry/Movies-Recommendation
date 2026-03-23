<h2 align="center">
  StreamX - Movies Recommender System <br/>
</h2>
<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14.2-0f172a?logo=nextdotjs&logoColor=white">
  <img src="https://img.shields.io/badge/React-18.x-0f172a?logo=react&logoColor=61DAFB">
  <img src="https://img.shields.io/badge/Django-5.0-0f172a?logo=django&logoColor=092E20">
  <img src="https://img.shields.io/badge/Python-3.11-0f172a?logo=python&logoColor=3776AB">
  <img src="https://img.shields.io/badge/NumPy-Data%20Processing-0f172a?logo=numpy&logoColor=013243">
</p>

<p align="center">
  A full-stack application implementing a custom Recommender System with a modern web interface.
</p>

## Features

- **Robust Recommendation Engine**
  - **Matrix Factorization**: Custom implementations trained with Stochastic Gradient Descent (SGD) and Alternating Least Squares (ALS).
  - **Deep Neural CF**: Hybrid deep learning model with Text CNN for title feature extraction.
  - **Matrix SVD**: Closed-form SVD latent factors calibrated with Ridge/Lasso regression.
- **Automated Data Processing**
  - Per-user random 80/20 data split for reliable training and testing.
- **Comprehensive Evaluation Metrics**
  - **Rating Prediction**: `MAE`, `RMSE`
  - **Top-K Recommendations**: `Precision@10`, `Recall@10`, `F-measure@10`, `NDCG@10`
- **Structural Data Analysis**
  - Distribution profiling, feature influence analysis, latent factor interpretation, and synthetic data generation.
- **Modern Web Interface (Next.js + Django)**
  - Browse library with multi-genre filtering and sorting.
  - Detailed movie pages with metadata and similar movie suggestions.
  - Personalized user profiles showcasing rating history and top recommendations.
  - Dynamic TMDB API integration for rich image enrichment (posters and backdrops).

## UX Preview

| Home Page | Top Picks |
| :---: | :---: |
| ![Home](preview/Home.png) | ![Top Picks](preview/TopPicks.png) |

| Library | Movie Detail | Community |
| :---: | :---: | :---: |
| ![Library](preview/Library.png) | ![Movie Detail](preview/MovieDetail.png) | ![Community](preview/Community.png) |

| User Profile | Actor Detail | Settings |
| :---: | :---: | :---: |
| ![User Profile](preview/UserDetail.png) | ![Actor Detail](preview/ActorDetail.png) | ![Settings](preview/Settings.png) |

## Project Structure

```text
dataset/          # Raw MovieLens data (e.g. ml-latest-small/, ml-latest/)
backend/          # Django REST API
frontend/         # Next.js web application
models/           # ML model code and generated artifacts (option1, option2, option3, option4, splits)
scripts/          # Training, evaluation, enrichment, and report generation
analysis/         # Final report (final_report.md), figures, and JSON/CSV artifacts
```

## Getting Started

### Quick start (after environment setup)

Once the Python venv and dependencies are installed (Step 1 below) and the model is trained (Step 2), you can start both backend and frontend with one command:

- **Windows (PowerShell):** `.\start.ps1`
- **macOS / Linux:** `./start.sh`

This starts the Django API on port 8001 and the Next.js app on port 3001, and opens the app in your browser.

### 1. Python Environment Setup

Requires **Python 3.11** (or a compatible 3.x version). Create and activate a virtual environment, then install dependencies:

```bash
# macOS / Linux
python -m venv .venv
source .venv/bin/activate

# Windows
python -m venv .venv
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

If you plan to train the Option 2 deep model locally, install training extras:

```bash
pip install -r requirements-train.txt
```

### 2. Train the Model

Train the recommender model using the provided dataset. Place MovieLens data under `dataset/ml-latest-small/` (or pass `--dataset-dir`). Model files and train/test splits are saved under `models/artifacts/<model-type>/` (e.g. `models/artifacts/option1/`); metadata is shared in `models/artifacts/`.

```bash
python -m scripts.train_and_evaluate --dataset-dir dataset/ml-latest-small --top-k 10
```

Top-K relevance threshold can be configured (default: `rating >= 4.0`):
```bash
python -m scripts.train_and_evaluate --top-k 10 --topn-relevance rating_threshold --min-relevant-rating 4.0
```

By default, Top-K evaluation follows the CS550 holdout definition (`--topn-relevance all_test`), which treats all testing interactions as relevant.

*(Optional)* Tune Matrix Factorization hyperparameters:
```bash
python -m scripts.train_and_evaluate --dataset-dir dataset/ml-latest-small --n-factors 48 --epochs 30 --lr 0.01 --reg 0.05
```

Train the improved Option 2 hybrid deep model (title + genre features):
```bash
python -m scripts.train_and_evaluate --model-type option2 --dataset-dir dataset/ml-latest-small --n-factors 64 --epochs 30 --option2-lr 0.001 --batch-size 256
```

Train the Matrix SVD with Ridge or Lasso Regression (Option 3):
```bash
python -m scripts.train_and_evaluate --model-type option3_ridge --n-factors 48 --option3-reg-alpha 0.1
```

Train the Matrix Factorization ALS model (Option 4):
```bash
python -m scripts.train_and_evaluate --model-type option4 --epochs 15 --n-factors 48 --reg 0.05 --option4-bias-reg 5.0
```

Useful Option 2 controls:
- `--option2-dropout-rate`
- `--option2-l2-reg`
- `--option2-validation-split`
- `--option2-lr-plateau-patience`
- `--option2-rating-weight-power`

The script caches a shared train/test split in `models/artifacts/splits/` so all models are evaluated on the same holdout split. Use `--force-resplit` to regenerate.

### 3. Fetch Movie Information (Optional but Recommended)

Enrich movie records with posters, backdrops, overviews, and cast/director data from [TMDB](https://www.themoviedb.org/documentation/api). The script reads `movies.csv` from training artifacts and writes `models/artifacts/movies_enriched.csv`. Run **after** training (Step 2).

1. Get a free API key at [TMDB](https://www.themoviedb.org/documentation/api) and create a `.env` in the project root:
   ```bash
   TMDB_API_KEY=your_api_key_here
   ```
2. Run the scraper:
   ```bash
   python -m scripts.scrape_tmdb
   ```

### 4. Start the Backend API

Start the Django development server:

```bash
cd backend
python manage.py runserver 8001
```

**Key Endpoints:**
- `GET /api/health` — API health check
- `GET /api/movies` — Paginated movies with search and genre filters
- `GET /api/movie/<id>` — Movie detail and metadata
- `GET /api/recommend/<user_id>` — Top-K recommendations for a user
- `GET /api/users` — User list
- `GET /api/user/<user_id>/history` — User rating history
- `GET /api/predict/<user_id>/<item_id>` — Predicted rating for a user–item pair
- `GET /api/search` — Full-text movie search
- `GET /api/stats` — Database statistics
- `GET /api/model-config` — Loaded model configuration
- TMDB and scrape endpoints for image enrichment (see backend `api/urls.py` for full list)

### 5. Start the Frontend Application

In a new terminal, start the Next.js application:

```bash
cd frontend
npm install
npm run dev -- -p 3001
```

*(Optional)* If you need to specify a custom backend URL:
```bash
NEXT_PUBLIC_API_BASE_URL="http://localhost:8001/api" npm run dev -- -p 3001
```

**Access the application at:** `http://localhost:3001`

## Deploy on Render

This repository includes a `render.yaml` blueprint for a two-service deployment:

- `streamx-backend` (Django API, Python)
- `streamx-frontend` (Next.js UI, Node.js)

### 1) Connect the repository

In Render, create a **Blueprint** service and point it to this repository. Render will detect `render.yaml` and propose both services.

### 2) Configure frontend API URL

Set frontend env var `NEXT_PUBLIC_API_BASE_URL` to your backend public URL:

```text
https://<your-backend-service>.onrender.com/api
```

### 3) Model/data storage on Render

For the free-tier blueprint, the backend uses `STREAMX_DATA_DIR=/tmp/streamx`.

- On first boot, `backend/start_render.sh` seeds that directory from `models/artifacts/`.
- Runtime updates (for example `active_model.txt`, `movies_enriched.csv`, and `scrape_state.json`) are written there while the instance is alive.
- Note: `/tmp` is ephemeral on free tier, so data may reset after restart/redeploy.

### 4) Required backend environment variables

- `SECRET_KEY` (generated in blueprint by default)
- `DEBUG=False`
- `ALLOWED_HOSTS=.onrender.com` (or your custom domain list)
- `TMDB_API_KEY` (optional, required for TMDB scraping endpoints)

## Technical Notes

- The data loader supports both `csv` and `dat` MovieLens formats.
- The recommender algorithm is built from scratch and does not rely on black-box recommendation libraries.
- The analysis pipeline is designed to support course-style interpretation questions, not only predictive metrics.
- The UI features a responsive design, glass-morphism effects, and dynamic filtering components.

### Analysis Report

**Report:** [analysis/Report.md](analysis/Report.md)

You can also run the analysis pipeline after training to produce a single technical report that compares both recommender options and documents the dataset structure:

```bash
python -m scripts.generate_report
```

This generates:
- `analysis/figures/`
- `analysis/artifacts/final_summary.json`
- `analysis/artifacts/option1_analysis.json`
- `analysis/artifacts/option1_synthetic_ratings.csv`
- `analysis/artifacts/option2_analysis.json`
- `analysis/artifacts/option2_synthetic_ratings.csv`

The report covers:
- Data distribution and sparsity
- Model performance comparison across variants
- Training-curve analysis
- Feature influence with bootstrap confidence intervals
- Signal-vs-noise ablation checks
- Latent factor interpretation for both models
- Synthetic rating generation for realism checks
- Limitations and recommendation for the final submission

## Acknowledgements

Special thanks to the open-source projects and communities that made this possible:
- **[MovieLens](https://grouplens.org/datasets/movielens/)** for the core datasets used in model training and evaluation.
- **[TMDB API](https://www.themoviedb.org/documentation/api)** for providing rich movie metadata and high-quality image assets.
- **[Next.js](https://nextjs.org/)** & **[Django](https://www.djangoproject.com/)** for powering the frontend and backend architectures respectively.
- **[pandas](https://pandas.pydata.org/)** & **[NumPy](https://numpy.org/)** for efficient data manipulation and computation.