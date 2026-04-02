"""Recommender model classes (lazy imports so optional deps are not loaded until needed)."""

from typing import TYPE_CHECKING, Any

__all__ = [
    "Option1MatrixFactorizationSGD",
    "Option2DeepRecommender",
    "Option3SVDHybridRecommender",
    "Option4ALSRecommender",
]

if TYPE_CHECKING:
    from .option1_recommender import Option1MatrixFactorizationSGD
    from .option2_recommender import Option2DeepRecommender
    from .option3_recommender import Option3SVDHybridRecommender
    from .option4_recommender import Option4ALSRecommender


def __getattr__(name: str) -> Any:
    if name == "Option1MatrixFactorizationSGD":
        from .option1_recommender import Option1MatrixFactorizationSGD

        return Option1MatrixFactorizationSGD
    if name == "Option2DeepRecommender":
        from .option2_recommender import Option2DeepRecommender

        return Option2DeepRecommender
    if name == "Option3SVDHybridRecommender":
        from .option3_recommender import Option3SVDHybridRecommender

        return Option3SVDHybridRecommender
    if name == "Option4ALSRecommender":
        from .option4_recommender import Option4ALSRecommender

        return Option4ALSRecommender
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
