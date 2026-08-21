const mongoose = require('mongoose');
const { AsyncLocalStorage } = require('async_hooks');

const tenantLocalStorage = new AsyncLocalStorage();

function createTenantModel(modelName, schema, options = {}) {
  const centralCollection = options.centralCollection || schema.options.collection || undefined;
  const tenantCollection = options.tenantCollection || schema.options.collection || undefined;

  // Compile on the default connection
  const defaultModel = mongoose.models[modelName] || mongoose.model(modelName, schema, centralCollection);

  const proxy = new Proxy(defaultModel, {
    get(target, prop, receiver) {
      if (prop === 'schema') return schema;
      if (prop === 'collectionName') return tenantCollection;
      if (prop === 'modelName') return modelName;

      const store = tenantLocalStorage.getStore();
      const activeConnection = store && store.connection;
      
      if (activeConnection) {
        let tenantModel = activeConnection.models[modelName];
        if (!tenantModel) {
          tenantModel = activeConnection.model(modelName, schema, tenantCollection);
        }
        const value = Reflect.get(tenantModel, prop);
        if (typeof value === 'function') {
          return value.bind(tenantModel);
        }
        return value;
      }
      
      const value = Reflect.get(target, prop);
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
    construct(target, argumentsList, newTarget) {
      const store = tenantLocalStorage.getStore();
      const activeConnection = store && store.connection;
      let model = target;
      
      if (activeConnection) {
        model = activeConnection.models[modelName];
        if (!model) {
          model = activeConnection.model(modelName, schema, tenantCollection);
        }
      }
      return Reflect.construct(model, argumentsList, newTarget);
    }
  });

  return proxy;
}

module.exports = {
  tenantLocalStorage,
  createTenantModel
};
