from django.urls import path

from api import views


urlpatterns = [
    path("health", views.health, name="health"),
    path("movies", views.movies, name="movies"),
    path("movie/<int:item_id>", views.movie_detail, name="movie-detail"),
    path("users", views.users, name="users"),
    path("user/<int:user_id>/history", views.user_history, name="user-history"),
    path("recommend/<int:user_id>", views.recommend, name="recommend"),
    path("search", views.search, name="search"),
]
