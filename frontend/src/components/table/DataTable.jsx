import React from 'react';
import Table from '../Table';

const DataTable = React.memo(({
  headers = [],
  data = [],
  actions = [],
  inlineActions = true,
  loading = false,
  itemsPerPage = 15,
  emptyState = null,
  flat = false,
  className = ''
}) => {
  return (
    <div className={`w-full ${className}`}>
      <Table
        headers={headers}
        data={data}
        actions={actions}
        inlineActions={inlineActions}
        _loading={loading}
        itemsPerPage={itemsPerPage}
        emptyState={emptyState}
        flat={flat}
      />
    </div>
  );
});

DataTable.displayName = 'DataTable';

export default DataTable;
