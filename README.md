# CS550 Option 1 Recommender System

This project implements **Option 1 (Recommender System)** from the CS550 project specification as a full-stack application.

## Implemented Option 1 Requirements

- Data preprocessing with **per-user random 80/20 split** into training and testing sets.
- Rating prediction on the test set with **MAE** and **RMSE**.
- Top-10 recommendation for each user (excluding training-set items), evaluated with:
  - **Precision@10**
  - **Recall@10**
  - **F-measure@10**
  - **NDCG@10**
- Web demo with:
  - Home page (movie list)
  - Movie detail page (metadata + similar movies)
  - Recommendation page (input user ID and get top-10 recommendations)

## UX Preview

### Home Page
![Home](preview/Home.png)

### Library (Browse Movies)
![Library](preview/Library.png)

### Movie Detail
![Movies Detail](preview/Movies%20Detail.png)

### Community (Browse Users)
![Community](preview/Community.png)

### User Profile
![User Profile](preview/User%20Profile.png)

## Project Structure

```text
dataset/
reference/
backend/
frontend/
models/
scripts/
README.md
requirements.txt
```

## 1) Python Environment

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 2) Train and Evaluate

Run from the repository root:

```bash
python -m scripts.train_and_evaluate --dataset-dir dataset/ml-latest-small --top-k 10
```

Optional Matrix Factorization hyperparameters:

```bash
python -m scripts.train_and_evaluate --dataset-dir dataset/ml-latest-small --top-k 10 --n-factors 48 --epochs 30 --lr 0.01 --reg 0.05 --lr-decay 0.98
```

Artifacts are saved to `models/artifacts/`:

- `model.pkl`
- `movies.csv`
- `train_ratings.csv`
- `test_ratings.csv`
- `metrics.json`

## 3) Start Backend (Django API)

```bash
cd backend
python manage.py runserver 8001
```

Available endpoints:

- `GET /api/health`
- `GET /api/movies?limit=50&offset=0&q=&genre=&year=&sort_by=item_id&sort_order=asc`
- `GET /api/movie/{id}`
- `GET /api/recommend/{user_id}`
- `GET /api/users?limit=50&offset=0`
- `GET /api/user/{user_id}/history`
- `GET /api/search?q=toy`

## 4) Start Frontend (Next.js + HeroUI)

Run in a separate terminal:

```bash
cd frontend
npm install
npx next dev -p 3001
```

Optional environment variable:

- `NEXT_PUBLIC_API_BASE_URL` (default in code: `http://localhost:8000/api`, recommended for this project: `http://localhost:8001/api`)

Set it before starting frontend if needed:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:8001/api"
npx next dev -p 3001
```

Visit:

- Frontend: `http://localhost:3001`
- Backend API: `http://localhost:8001/api/health`

## Notes

- The data loader supports both MovieLens CSV and DAT formats.
- The recommender algorithm is a custom Matrix Factorization model trained with SGD.
- The model code is custom and does not directly use packaged recommendation algorithms as a black box.
