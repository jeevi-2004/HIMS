/**
 * Enterprise Testing Environment Setup & Global Browser Mocks
 */

// Global window mock APIs for headless test environments
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  });

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverMock;

  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = IntersectionObserverMock;
}
