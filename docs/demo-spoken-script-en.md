# StreamX demo · spoken script

About **three to four minutes** at a normal pace. Cut paragraphs if you run short on time.

---

### Opening

Hi everyone. We built **StreamX**, a movie recommender: we trained several algorithms on the backend and shipped them in a ready-to-use web demo on the frontend.

### Home page

Let’s start with **“Top Picks for You.”** **This row is the personalized list our model builds live for whoever is logged in.** Each poster shows a **Match** score so you can see how strong the model thinks the fit is for this user; the row scrolls horizontally.

If we don’t get personalized recommendations for this session, that row usually **doesn’t appear at all**, and we move straight to the sections below.

Below that is **“Watch It Again.”** We pull titles from **this user’s personal history** in the system—it’s basically **your own replay strip**. 

Under that comes **“Trending Now.”** We rank titles by **catalog-wide behavioral popularity**, highest scores first—a station-wide popularity strip.

**Top Picks is model-ranked for this account; Watch It Again is personal history replay; Trending is catalog-wide behavioral hits**—three pipelines you can separate in one glance.

### Detail page

Next we open a movie and focus on two explainability panels we built.

#### Why Recommended

When a user opens a movie from Top Picks, we display a “Why Recommended” section. This text isn’t hardcoded in the frontend—it’s recomputed on the backend using the currently active recommender.

We first estimate the user’s predicted rating for the movie. We show the explanation only if the score is high and matches the user’s preferred genres. The system then identifies nearby items in the embedding space and explains those neighbors, forming the collaborative filtering component.

We also incorporate shared genres among those neighbors, along with global signals such as view counts and average ratings. Redundant points are removed and the number of lines is capped, so the explanation reflects concrete signals rather than filler.

When the recommender changes, the model weights shift, and this entire explanation is recomputed accordingly.

#### Why Similar

If we scroll down on the detail page and open another title from **More Like This**, we show **Why Similar.** The backend uses the active model to measure **how close two movies are inside the model**, then adds genre-style hints—it explains similarity **between this movie and the movie you came from**, not “why we picked this for a user.”

### Settings · Engines & charts

Finally, open **Engines** in Settings. Here you can switch the active recommender, each with a short description. After switching, the home feed, detail-page scores, and the engine badge all refresh.

Below is a **multi-engine radar chart** with six offline metrics. **MAE** and **RMSE** measure prediction error (lower is better). **Precision@10, Recall@10, F1@10, and NDCG@10** capture top-10 ranking quality (higher is better). In demos, we summarize it simply: error axes stay close to the center, ranking axes push outward. Each color represents an engine, and the one that fills the shape more evenly tends to perform best overall offline.

Further down are **training curves** for the active engine. The horizontal axis shows training rounds, and the vertical axis shows loss or error. A downward trend indicates improving performance.

### Closing

To wrap up: **Top Picks on the home page turns recommendations into something you can browse; the detail page explains why; Settings lets you switch engines and read charts so class metrics match what users see.** Thank you.

---

*中文版：[demo-spoken-script.md](./demo-spoken-script.md)*