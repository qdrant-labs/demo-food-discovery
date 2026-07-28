import { useEffect, useState } from "react";

import "./App.css";

import Header from "./components/Header";
import DiscoveryGrid from "./components/DiscoveryGrid";
import LoadingState from "./components/LoadingState";
import EmptyState from "./components/EmptyState";
import Footer from "./components/Footer";
import HowItWorksModal from "./components/HowItWorksModal";
import FoodDetailModal from "./components/FoodDetailModal";

import { search } from "./lib/api";

function App() {
  const [theme, setTheme] = useState("light");
  const [foods, setFoods] = useState([]);
  const [likedIds, setLikedIds] = useState([]);
  const [dislikedIds, setDislikedIds] = useState([]);
  const [newStrategy, setNewStrategy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isHowOpen, setIsHowOpen] = useState(false);
  const [detailFood, setDetailFood] = useState(null);

  async function runSearch(liked, disliked, strategy) {
    setLoading(true);
    try {
      const results = await search({
        positive: liked,
        negative: disliked,
        strategy: strategy ? "best_score" : "average_vector",
      });
      setFoods(results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSearch([], [], newStrategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReaction(food, reaction) {
    const liked = likedIds.filter((id) => id !== food.id);
    const disliked = dislikedIds.filter((id) => id !== food.id);

    if (reaction === "like") liked.unshift(food.id);
    if (reaction === "dislike") disliked.unshift(food.id);

    setLikedIds(liked);
    setDislikedIds(disliked);
    await runSearch(liked, disliked, newStrategy);
  }

  function toggleStrategy() {
    const next = !newStrategy;
    setNewStrategy(next);
    runSearch(likedIds, dislikedIds, next);
  }

  function reset() {
    setLikedIds([]);
    setDislikedIds([]);
    runSearch([], [], newStrategy);
  }

  const tasteCount = likedIds.length + dislikedIds.length;

  return (
    <main className={`app ${theme}`}>
      <Header
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onOpenHowItWorks={() => setIsHowOpen(true)}
      />

      <section className="page">
        <div className="search-panel">
          <div className="eyebrow">Vector food discovery</div>

          <h1>Food Discovery</h1>

          <p>
            Like the dishes you fancy and skip the ones you do not — Qdrant's
            Discovery API refines recommendations from your taste in real time.
          </p>

          <div className="discovery-controls">
            <label className="strategy-toggle">
              <input
                type="checkbox"
                checked={newStrategy}
                onChange={toggleStrategy}
              />
              <span>Best-score strategy</span>
            </label>

            <div className="taste-summary">
              <span className="taste-pill liked">{likedIds.length} liked</span>
              <span className="taste-pill disliked">
                {dislikedIds.length} skipped
              </span>
              {tasteCount > 0 && (
                <button className="reset-button" onClick={reset}>
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : foods.length > 0 ? (
          <DiscoveryGrid
            foods={foods}
            likedIds={likedIds}
            dislikedIds={dislikedIds}
            onReaction={handleReaction}
            onOpenDetail={setDetailFood}
          />
        ) : (
          <EmptyState tasteCount={tasteCount} onReset={reset} />
        )}
      </section>

      <Footer theme={theme} />

      {isHowOpen && <HowItWorksModal onClose={() => setIsHowOpen(false)} />}

      {detailFood && (
        <FoodDetailModal
          food={detailFood}
          onClose={() => setDetailFood(null)}
          onReaction={handleReaction}
        />
      )}
    </main>
  );
}

export default App;
