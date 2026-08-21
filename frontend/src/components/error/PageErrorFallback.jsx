import React from 'react';
import ErrorState from '../feedback/ErrorState';

const PageErrorFallback = React.memo(({
  title = 'Workspace Render Error',
  description = 'An unexpected UI rendering error occurred in this workspace.',
  resetErrorBoundary
}) => {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center p-6 bg-[#F8FAFC]">
      <ErrorState
        title={title}
        description={description}
        retry={resetErrorBoundary}
      />
    </div>
  );
});

PageErrorFallback.displayName = 'PageErrorFallback';

export default PageErrorFallback;
