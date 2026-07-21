function HowItWorksModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="how-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p>How it works</p>

            <h2>Food discovery powered by semantic search</h2>
          </div>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-content">
          <div className="pipeline">
            <div className="pipeline-node">
              <span>1</span>

              <strong>Food data</strong>

              <p>
                Each food has a name, cuisine, description, flavors, and tags.
              </p>
            </div>

            <div className="pipeline-arrow">→</div>

            <div className="pipeline-node">
              <span>2</span>

              <strong>Embeddings</strong>

              <p>
                Food descriptions are converted into vectors in your browser
                with a sentence-transformer model.
              </p>
            </div>

            <div className="pipeline-arrow">→</div>

            <div className="pipeline-node">
              <span>3</span>

              <strong>Vector search</strong>

              <p>
                Cosine similarity finds the closest foods — the same math a
                Qdrant collection uses.
              </p>
            </div>

            <div className="pipeline-arrow">→</div>

            <div className="pipeline-node">
              <span>4</span>

              <strong>Taste profile</strong>

              <p>
                Likes and skips update recommendations based on what you prefer.
              </p>
            </div>
          </div>

          <div className="how-section">
            <h3>What the app demonstrates</h3>

            <div className="mode-grid">
              <div className="mode-card">
                <span>Search</span>

                <p>
                  Search by meaning, not just exact words. For example, “spicy
                  noodles” can find ramen, pho, or other similar dishes.
                </p>
              </div>

              <div className="mode-card">
                <span>Recommendations</span>

                <p>
                  When you like food cards, the app averages their vectors into
                  a taste vector and finds the nearest foods.
                </p>
              </div>

              <div className="mode-card">
                <span>Skips</span>

                <p>
                  Disliked foods are excluded from the recommendation feed so
                  the app can keep refining what it shows.
                </p>
              </div>

              <div className="mode-card">
                <span>Local-first</span>

                <p>
                  The demo starts with a local JSON dataset, making it easy to
                  run, test, and deploy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HowItWorksModal;
