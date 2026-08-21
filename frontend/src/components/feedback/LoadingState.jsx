import React from 'react';

const LoadingState = React.memo(({
  message = 'Loading data...',
  size = 'md',
  fullscreen = false,
  className = ''
}) => {
  const content = (
    <div className={`flex flex-col items-center justify-center p-6 space-y-3 ${className}`}>
      <div className="w-8 h-8 rounded-xl bg-[#2F63F2]/10 border border-[#2F63F2]/20 flex items-center justify-center text-[#2F63F2] animate-spin">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.75v1.5M12 17.75v1.5M4.75 12h1.5M17.75 12h1.5" />
        </svg>
      </div>
      {message && (
        <span className="text-xs font-semibold text-slate-500 animate-pulse">
          {message}
        </span>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC]">
        {content}
      </div>
    );
  }

  return content;
});

LoadingState.displayName = 'LoadingState';

export default LoadingState;
