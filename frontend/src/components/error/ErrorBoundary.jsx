import React, { Component } from 'react';
import PageErrorFallback from './PageErrorFallback';
import { logger } from '../../utils/logger';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL COMPONENT ERROR in ErrorBoundary:', error?.message || error, '\nStack:', error?.stack || 'No stack trace');
    if (errorInfo?.componentStack) {
      console.error('Component stack:', errorInfo.componentStack);
    }
    logger.error('React ErrorBoundary caught rendering exception', {
      message: error?.message || String(error),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          resetErrorBoundary: this.handleReset
        });
      }

      return (
        <PageErrorFallback
          error={this.state.error}
          resetErrorBoundary={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
