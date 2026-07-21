import { useState } from "react";

function FoodCard({ food, onReaction }) {
  const rating = food.restaurant?.rating;
  const [imageOk, setImageOk] = useState(Boolean(food.image_url));

  return (
    <article className="food-card">
      <div className="food-image">
        {imageOk ? (
          <img
            src={food.image_url}
            alt={food.name}
            loading="lazy"
            onError={() => setImageOk(false)}
          />
        ) : (
          <span>🍽️</span>
        )}
      </div>

      <div className="food-card-body">
        <div className="food-tags">
          {food.restaurant?.name && <span>{food.restaurant.name}</span>}
          {typeof rating === "number" && <span>★ {rating.toFixed(1)}</span>}
        </div>

        <h3>{food.name}</h3>

        <p>{food.description}</p>

        {typeof food.score === "number" && (
          <div className="score">Match {food.score.toFixed(3)}</div>
        )}
      </div>

      <div className="food-actions">
        <button className="dislike-button" onClick={() => onReaction(food, "dislike")}>
          Skip
        </button>
        <button className="like-button" onClick={() => onReaction(food, "like")}>
          Like
        </button>
      </div>
    </article>
  );
}

export default FoodCard;
