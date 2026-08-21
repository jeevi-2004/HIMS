import React from 'react';
import EmptyStateCard from '../shared/EmptyStateCard';

const EmptyState = React.memo(({
  icon,
  title,
  description,
  action,
  buttonText,
  buttonAction,
  compact = false,
  children,
  className = ''
}) => {
  return (
    <EmptyStateCard
      icon={icon}
      title={title}
      description={description}
      buttonText={buttonText || (action ? action.text : undefined)}
      buttonAction={buttonAction || (action ? action.onClick : undefined)}
      className={`${compact ? 'p-4 my-2 max-w-sm' : ''} ${className}`}
    >
      {children}
    </EmptyStateCard>
  );
});

EmptyState.displayName = 'EmptyState';

export default EmptyState;
