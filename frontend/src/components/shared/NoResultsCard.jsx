import React from 'react';
import { Search } from 'lucide-react';
import EmptyStateCard from './EmptyStateCard';

const NoResultsCard = React.memo(({
  title = 'No Search Results',
  description = 'No matching records found for the given search criteria.',
  onClearFilters,
  className = ''
}) => {
  return (
    <EmptyStateCard
      icon={Search}
      title={title}
      description={description}
      buttonText={onClearFilters ? 'Clear Filters' : undefined}
      buttonAction={onClearFilters}
      className={className}
    />
  );
});

NoResultsCard.displayName = 'NoResultsCard';

export default NoResultsCard;
