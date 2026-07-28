import { useEffect, useState } from "react";

import "./App.css";

import Header from "./components/Header";
import SearchBar from "./components/SearchBar";
import DiscoveryGrid from "./components/DiscoveryGrid";
import LoadingState from "./components/LoadingState";
import EmptyState from "./components/EmptyState";
import Footer from "./components/Footer";
import HowItWorksModal from "./components/HowItWorksModal";
import FoodDetailModal from "./components/FoodDetailModal";

import { search } from "./lib/api";

const EXAMPLES = ["sushi", "pizza", "vegan salad", "burger", "ramen", "dessert"];

// Cities that are dense in the Wolt dataset — proximity presets.
const CITIES = [
  { name: "Budapest", lat: 47.4979, lon: 19.0402 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Prague", lat: 50.0755, lon: 14.4378 },
  { name: "Athens", lat: 37.9838, lon: 23.7275 },
  { name: "Berlin", lat: 52.52, lon: 13.405 },
  { name: "Tel Aviv", lat: 32.0853, lon: 34.7818 },
];
const RADII = [10, 25, 50];

function App() {
  const [theme, setTheme] = useState("light");
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState([]);
  // Keep the full items (not just ids) so likes/dislikes can be shown + removed.
  const [likedItems, setLikedItems] = useState([]);
  const [dislikedItems, setDislikedItems] = useState([]);
  const [newStrategy, setNewStrategy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isHowOpen, setIsHowOpen] = useState(false);
  const [detailFood, setDetailFood] = useState(null);
  const [location, setLocation] = useState(null); // { name, latitude, longitude, radius_km } | null

  async function runSearch(liked, disliked, text, strategy, loc = location) {
    setLoading(true);
    setHasSearched(true);
    try {
      const results = await search({
        positive: liked.map((f) => f.id),
        negative: disliked.map((f) => f.id),
        queries: text && text.trim() ? [text.trim()] : [],
        strategy: strategy ? "best_score" : "average_vector",
        location: loc
          ? { latitude: loc.latitude, longitude: loc.longitude, radius_km: loc.radius_km }
          : null,
      });
      setFoods(results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSearch([], [], "", newStrategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCity(city) {
    const loc = {
      name: city.name,
      latitude: city.lat,
      longitude: city.lon,
      radius_km: location?.radius_km || 25,
    };
    setLocation(loc);
    runSearch(likedItems, dislikedItems, query, newStrategy, loc);
  }

  function clearLocation() {
    setLocation(null);
    runSearch(likedItems, dislikedItems, query, newStrategy, null);
  }

  function changeRadius(km) {
    if (!location) return;
    const loc = { ...location, radius_km: km };
    setLocation(loc);
    runSearch(likedItems, dislikedItems, query, newStrategy, loc);
  }

  function handleReaction(food, reaction) {
    const liked = likedItems.filter((f) => f.id !== food.id);
    const disliked = dislikedItems.filter((f) => f.id !== food.id);
    if (reaction === "like") liked.unshift(food);
    if (reaction === "dislike") disliked.unshift(food);
    setLikedItems(liked);
    setDislikedItems(disliked);
    runSearch(liked, disliked, query, newStrategy);
  }

  // Remove a single liked/disliked dish from the taste profile.
  function removeTaste(id) {
    const liked = likedItems.filter((f) => f.id !== id);
    const disliked = dislikedItems.filter((f) => f.id !== id);
    setLikedItems(liked);
    setDislikedItems(disliked);
    runSearch(liked, disliked, query, newStrategy);
  }

  function onTextSearch(text = query) {
    setQuery(text);
    runSearch(likedItems, dislikedItems, text, newStrategy);
  }

  function toggleStrategy() {
    const next = !newStrategy;
    setNewStrategy(next);
    runSearch(likedItems, dislikedItems, query, next);
  }

  function reset() {
    setLikedItems([]);
    setDislikedItems([]);
    setQuery("");
    setLocation(null);
    runSearch([], [], "", newStrategy, null);
  }

  const likedIds = likedItems.map((f) => f.id);
  const dislikedIds = dislikedItems.map((f) => f.id);
  const tasteCount = likedItems.length + dislikedItems.length;

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
            Search by craving, then like or dislike dishes — Qdrant's Discovery
            API refines recommendations from your taste in real time.
          </p>

          <SearchBar
            query={query}
            setQuery={setQuery}
            onSearch={() => onTextSearch(query)}
            onExampleSearch={onTextSearch}
            loading={loading}
            examples={EXAMPLES}
          />

          <div className="location-row">
            <span className="location-label">Near</span>
            <div className="location-chips">
              <button
                className={!location ? "active" : ""}
                onClick={clearLocation}
              >
                Anywhere
              </button>
              {CITIES.map((c) => (
                <button
                  key={c.name}
                  className={location?.name === c.name ? "active" : ""}
                  onClick={() => selectCity(c)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {location && (
              <select
                className="radius-select"
                value={location.radius_km}
                onChange={(e) => changeRadius(Number(e.target.value))}
              >
                {RADII.map((km) => (
                  <option key={km} value={km}>
                    within {km} km
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="discovery-controls">
            <label className="strategy-toggle">
              <input
                type="checkbox"
                checked={newStrategy}
                onChange={toggleStrategy}
              />
              <span>Best-score strategy</span>
            </label>

            {tasteCount > 0 && (
              <button className="reset-button" onClick={reset}>
                Reset taste
              </button>
            )}
          </div>

          {tasteCount > 0 && (
            <div className="taste-lists">
              {likedItems.length > 0 && (
                <TasteRow label="Liked" tone="liked" items={likedItems} onRemove={removeTaste} />
              )}
              {dislikedItems.length > 0 && (
                <TasteRow label="Disliked" tone="disliked" items={dislikedItems} onRemove={removeTaste} />
              )}
            </div>
          )}
        </div>

        {foods.length > 0 ? (
          <div className={loading ? "is-loading" : ""}>
            <DiscoveryGrid
              foods={foods}
              likedIds={likedIds}
              dislikedIds={dislikedIds}
              onReaction={handleReaction}
              onOpenDetail={setDetailFood}
            />
          </div>
        ) : loading ? (
          <LoadingState />
        ) : (
          hasSearched && <EmptyState tasteCount={tasteCount} onReset={reset} />
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

// Removable chips for the liked / disliked dishes.
function TasteRow({ label, tone, items, onRemove }) {
  return (
    <div className={`taste-row ${tone}`}>
      <span className="taste-row-label">{label}</span>
      <div className="taste-chips">
        {items.map((f) => (
          <span key={f.id} className="taste-chip">
            {f.image_url && <img src={f.image_url} alt="" />}
            <span className="taste-chip-name">{f.name}</span>
            <button
              className="taste-chip-remove"
              aria-label={`Remove ${f.name}`}
              onClick={() => onRemove(f.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export default App;
