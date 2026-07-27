/**
 * AIImageAnalysisCard Component
 * Manages rendering the glassmorphism AI analysis results card.
 * Integrates into Vanilla JS/HTML environment.
 */
class AIImageAnalysisCard {
  /**
   * @param {string} containerId - The HTML Element ID where the card should render.
   * @param {Object} options - Callback functions
   * @param {Function} options.onRetake - Callback when "Retake Photo" is clicked
   * @param {Function} options.onContinue - Callback when "Continue" is clicked
   */
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.state = {
      status: 'idle', // 'idle' | 'loading' | 'success' | 'error'
      loadingStep: 0,
      description: '',
      objects: [],
      confidence: 0,
      rawJson: null,
      error: null
    };
    this.imageFile = null;
    this.loadingInterval = null;
  }

  /**
   * Set the file to analyze and run the analysis.
   * @param {File} file - Image file
   */
  setImage(file) {
    if (!file) return;
    this.imageFile = file;
    this.analyze();
  }

  /**
   * Clear component state and hide container.
   */
  clear() {
    this.imageFile = null;
    this.state = {
      status: 'idle',
      loadingStep: 0,
      description: '',
      objects: [],
      confidence: 0,
      rawJson: null,
      error: null
    };
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
    this.render();
  }

  /**
   * Trigger the background analysis call.
   */
  async analyze() {
    if (!this.imageFile) return;

    this.state.status = 'loading';
    this.state.loadingStep = 0;
    this.state.error = null;
    this.state.rawJson = null;
    this.render();

    const loadingTexts = [
      "Uploading Image...",
      "Analyzing Image...",
      "Generating Analysis..."
    ];

    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
    }

    // Cycle through loading stepper steps every 1.5s
    this.loadingInterval = setInterval(() => {
      if (this.state.loadingStep < loadingTexts.length - 1) {
        this.state.loadingStep++;
        this.render();
      }
    }, 1500);

    try {
      // Call the service layer
      const result = await ImageAnalysisService.analyzeImage(this.imageFile);
      
      if (this.loadingInterval) {
        clearInterval(this.loadingInterval);
        this.loadingInterval = null;
      }

      if (result.success) {
        this.state.status = 'success';
        this.state.description = result.description;
        this.state.objects = result.objects;
        this.state.confidence = result.confidence;
        this.state.rawJson = result.raw ? JSON.stringify(result.raw, null, 2) : null;
      } else {
        this.state.status = 'error';
        this.state.error = result.error;
        this.state.rawJson = result.raw ? JSON.stringify(result.raw, null, 2) : null;
      }
    } catch (err) {
      if (this.loadingInterval) {
        clearInterval(this.loadingInterval);
        this.loadingInterval = null;
      }
      this.state.status = 'error';
      this.state.error = 'AI_SERVICE_UNAVAILABLE';
      this.state.rawJson = null;
    }

    this.render();
  }

  /**
   * Handle retake photo action.
   */
  handleRetake() {
    this.clear();
    if (typeof this.options.onRetake === 'function') {
      this.options.onRetake();
    }
  }

  /**
   * Handle retrying the same photo analysis.
   */
  handleAnalyzeAgain() {
    this.analyze();
  }

  /**
   * Handle proceed to the rest of the flow.
   */
  handleContinue() {
    if (typeof this.options.onContinue === 'function') {
      this.options.onContinue();
    }
  }

  /**
   * Dynamically build and render the HTML of the card based on the current state.
   */
  render() {
    if (!this.container) return;

    if (this.state.status === 'idle') {
      this.container.style.display = 'none';
      this.container.innerHTML = '';
      return;
    }

    this.container.style.display = 'block';

    if (this.state.status === 'loading') {
      const loadingTexts = [
        "Uploading Image...",
        "Analyzing Image...",
        "Generating Analysis..."
      ];
      
      this.container.innerHTML = `
        <div class="ai-analysis-card loading-state">
          <div class="spinner-container">
            <span class="material-symbols-outlined animate-spin-slow" style="font-size: 28px;">psychology</span>
          </div>
          <div class="loading-progress-info">
            <h4 class="loading-title">AI Image Analyzer</h4>
            <div class="loading-step-stepper">
              ${loadingTexts.map((text, idx) => {
                let stepClass = '';
                if (idx === this.state.loadingStep) stepClass = 'active';
                else if (idx < this.state.loadingStep) stepClass = 'completed';
                
                return `
                  <div class="stepper-step ${stepClass}">
                    <span class="step-dot"></span>
                    <span class="step-text">${text}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (this.state.status === 'success') {
      const confidencePercent = Math.round(this.state.confidence * 100);
      let confidenceClass = 'conf-low';
      if (this.state.confidence >= 0.85) confidenceClass = 'conf-high';
      else if (this.state.confidence >= 0.60) confidenceClass = 'conf-med';

      this.container.innerHTML = `
        <div class="ai-analysis-card success-state glass-card">
          <div class="ai-header">
            <div class="ai-title-wrapper">
              <span class="material-symbols-outlined ai-icon">smart_toy</span>
              <h4 class="ai-title">AI Image Analysis</h4>
            </div>
            <span class="success-badge">
              <span class="material-symbols-outlined font-icon">verified</span>
              Success
            </span>
          </div>

          <div class="ai-body">
            <div class="analysis-section">
              <span class="section-label">Visual Description</span>
              <p class="analysis-description">${this.state.description}</p>
            </div>

            <div class="analysis-metadata">
              <div class="meta-section">
                <span class="section-label">Detected Objects</span>
                <div class="object-chips">
                  ${this.state.objects.map(obj => `<span class="object-chip">${obj}</span>`).join('')}
                </div>
              </div>
              <div class="meta-section">
                <span class="section-label">Confidence Score</span>
                <span class="confidence-badge ${confidenceClass}">${confidencePercent}%</span>
              </div>
            </div>

            <div class="read-only-note">
              <span class="material-symbols-outlined font-icon">info</span>
              This analysis is AI-generated and cannot be edited.
            </div>

            ${this.state.rawJson ? `
            <div class="raw-json-section" style="margin-top: 14px; border-top: 1px dashed var(--border-subtle); padding-top: 12px;">
              <details style="cursor: pointer;">
                <summary style="font-size: 0.8rem; font-weight: 700; color: var(--primary-purple); outline: none; list-style: none; display: flex; align-items: center; gap: 4px;">
                  <span class="material-symbols-outlined font-icon" style="font-size: 16px;">code</span>
                  View Raw JSON Response
                </summary>
                <pre style="margin-top: 8px; padding: 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-subtle); border-radius: 8px; font-family: var(--font-mono); font-size: 0.78rem; color: #38BDF8; overflow-x: auto; white-space: pre-wrap; text-align: left; max-height: 200px;"><code>${this.state.rawJson}</code></pre>
              </details>
            </div>
            ` : ''}
          </div>

          <div class="ai-card-actions">
            <button type="button" class="btn btn-secondary" onclick="window.aiAnalysisCardInstance.handleRetake()" style="padding: 10px 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
              <span class="material-symbols-outlined font-icon">refresh</span>
              Retake Photo
            </button>
            <button type="button" class="btn btn-secondary" onclick="window.aiAnalysisCardInstance.handleAnalyzeAgain()" style="padding: 10px 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
              <span class="material-symbols-outlined font-icon">psychology</span>
              Analyze Again
            </button>
            <button type="button" class="btn btn-primary" onclick="window.aiAnalysisCardInstance.handleContinue()" style="padding: 10px 20px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(59,130,246,0.25);">
              <span class="material-symbols-outlined font-icon">arrow_forward</span>
              Continue
            </button>
          </div>
        </div>
      `;
      return;
    }

    if (this.state.status === 'error') {
      this.container.innerHTML = `
        <div class="ai-analysis-card error-state glass-card">
          <div class="ai-header">
            <div class="ai-title-wrapper">
              <span class="material-symbols-outlined ai-icon">smart_toy</span>
              <h4 class="ai-title">AI Image Analysis</h4>
            </div>
            <span class="error-badge">
              <span class="material-symbols-outlined font-icon">error</span>
              Error
            </span>
          </div>

          <div class="ai-body">
            <div class="error-message-box">
              <span class="material-symbols-outlined font-icon">warning</span>
              <span class="error-text">Unable to analyze the image. Error: <strong>${this.state.error}</strong>. You can still continue with your report.</span>
            </div>
            ${this.state.rawJson ? `
            <div class="raw-json-section" style="margin-top: 14px; border-top: 1px dashed var(--border-subtle); padding-top: 12px;">
              <details style="cursor: pointer;">
                <summary style="font-size: 0.8rem; font-weight: 700; color: var(--danger-red); outline: none; list-style: none; display: flex; align-items: center; gap: 4px;">
                  <span class="material-symbols-outlined font-icon" style="font-size: 16px;">code</span>
                  View Error Response JSON
                </summary>
                <pre style="margin-top: 8px; padding: 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-subtle); border-radius: 8px; font-family: var(--font-mono); font-size: 0.78rem; color: var(--danger-red); overflow-x: auto; white-space: pre-wrap; text-align: left; max-height: 200px;"><code>${this.state.rawJson}</code></pre>
              </details>
            </div>
            ` : ''}
          </div>

          <div class="ai-card-actions">
            <button type="button" class="btn btn-secondary" onclick="window.aiAnalysisCardInstance.handleRetake()" style="padding: 10px 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
              <span class="material-symbols-outlined font-icon">refresh</span>
              Retake Photo
            </button>
            <button type="button" class="btn btn-secondary" onclick="window.aiAnalysisCardInstance.handleAnalyzeAgain()" style="padding: 10px 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
              <span class="material-symbols-outlined font-icon">psychology</span>
              Analyze Again
            </button>
            <button type="button" class="btn btn-primary" onclick="window.aiAnalysisCardInstance.handleContinue()" style="padding: 10px 20px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
              <span class="material-symbols-outlined font-icon">arrow_forward</span>
              Continue
            </button>
          </div>
        </div>
      `;
      return;
    }
  }
}
