/**
 * ImageAnalysisService
 * Exposes a single service method to call the backend AI image analysis endpoint
 * and normalize the response and error shapes.
 */
const ImageAnalysisService = {
  /**
   * Send image file to `/api/ai/image-analysis` via the api index client layer.
   * @param {File} imageFile - The file to be analyzed.
   * @returns {Promise<{success: boolean, description: string, objects: Array<string>, confidence: number, error: string|null}>}
   */
  async analyzeImage(imageFile) {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      // requestImageAnalysis is defined globally in js/api/index.js
      const response = await requestImageAnalysis(formData);

      if (response && response.data && response.data.success) {
        return {
          success: true,
          description: response.data.description,
          objects: response.data.objects || [],
          confidence: response.data.confidence || 0,
          raw: response.data,
          error: null
        };
      }

      return {
        success: false,
        description: '',
        objects: [],
        confidence: 0,
        raw: response?.data || null,
        error: response?.data?.error || 'UNKNOWN_ERROR'
      };
    } catch (error) {
      console.error('Error in ImageAnalysisService.analyzeImage:', error);
      const errorMsg = error.response?.data?.error || error.message || 'AI_SERVICE_UNAVAILABLE';
      return {
        success: false,
        description: '',
        objects: [],
        confidence: 0,
        raw: error.response?.data || null,
        error: errorMsg
      };
    }
  }
};
