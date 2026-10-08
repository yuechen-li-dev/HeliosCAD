/** Gateway-ready presentation; no provider requests or fabricated responses. */
export function AuthorPanel() {
  return <section className="author-panel" aria-label="AI Author">
    <div className="panel-heading"><span>AI AUTHOR</span><span className="panel-meta">P4-04</span></div>
    <div className="author-body"><span className="author-symbol">✧</span><h2>Engineering with an agent.</h2><p>Describe your intent, review a source change, then build it with Aetheris.</p>
      <div className="author-contract"><span>1 <strong>Propose</strong><small>Changes to Firmament source</small></span><span>2 <strong>Review</strong><small>Diffs and requested tool actions</small></span><span>3 <strong>Apply & build</strong><small>You approve. The compiler validates.</small></span></div>
      <p className="author-upcoming">Provider connection arrives in P4-04. No model is connected in this preview.</p>
    </div><div className="author-composer"><label>Provider<select disabled aria-label="AI provider"><option>Connection pending</option></select></label><textarea disabled aria-label="Engineering intent" placeholder="Describe what you want to engineer…" /><button disabled>Connect a provider to begin</button></div>
  </section>;
}
