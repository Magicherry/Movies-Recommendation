from django.urls import path

from api import views


urlpatterns = [
    path("health", views.health, name="health"),
    path("movies", views.movies, name="movies"),
    path("movie/<int:item_id>", views.movie_detail, name="movie-detail"),
    path("users", views.users, name="users"),
    path("user/<int:user_id>/history", views.user_history, name="user-history"),
    path("recommend/<int:user_id>", views.recommend, name="recommend"),
    path("predict/<int:user_id>/<int:item_id>", views.predict_rating, name="predict-rating"),
    path("search", views.search, name="search"),
    path("stats", views.db_stats, name="db-stats"),
    path("model-config", views.model_config, name="model-config"),
    path("scrape/start", views.scrape_start, name="scrape-start"),
    path("scrape/status", views.scrape_status, name="scrape-status"),
    path("scrape/key", views.scrape_key, name="scrape-key"),
    path("scrape/test-key", views.scrape_test_key, name="scrape-test-key"),
    path("tmdb/search", views.tmdb_search, name="tmdb-search"),
    path("tmdb/person/<int:person_id>", views.tmdb_person, name="tmdb-person"),
    path("person/movies", views.person_movies, name="person-movies"),
    path("tmdb/movie/<int:tmdb_id>/images", views.tmdb_movie_images, name="tmdb-movie-images"),
    path("movie/<int:item_id>/scrape", views.movie_apply_scrape, name="movie-apply-scrape"),
    path("movie/<int:item_id>/refresh-metadata", views.movie_refresh_metadata, name="movie-refresh-metadata"),
    path("movie/<int:item_id>/images", views.movie_update_images, name="movie-update-images"),
]
