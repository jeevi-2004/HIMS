/**
 * Reusable Axios Mock Response Generator
 */

export const mockApiResponse = (data, status = 200) => ({
  data: { success: true, data },
  status,
  statusText: 'OK',
  headers: {},
  config: {}
});

export const mockApiError = (message = 'API Error', status = 400) => ({
  response: {
    data: { success: false, message },
    status
  }
});
