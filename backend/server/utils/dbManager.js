const mongoose = require('mongoose');
const config = require('../config/config');

const tenantConnections = {};

function getTenantDatabaseUri(mainUri, databaseName) {
  if (!mainUri) {
    return `mongodb://jeevithavillzone_db_user:uDQWYc2aAfC68L299@ac-fsj27eb-shard-00-00.lusmhsf.mongodb.net:27017,ac-fsj27eb-shard-00-01.lusmhsf.mongodb.net:27017,ac-fsj27eb-shard-00-02.lusmhsf.mongodb.net:27017/${databaseName}?ssl=true&replicaSet=atlas-fsj27eb-shard-0&authSource=admin&retryWrites=true&w=majority&appName=HIMS`;
  }

  try {
    const parsed = new URL(mainUri);
    const originalDb = parsed.pathname ? parsed.pathname.replace(/^\//, '') : '';
    parsed.pathname = '/' + databaseName;

    // If authentication credentials are provided in the connection string, set authSource if missing
    if (parsed.username) {
      if (!parsed.searchParams.has('authSource')) {
        parsed.searchParams.set('authSource', 'admin');
      }
    }
    return parsed.toString();
  } catch (err) {
    // Fallback: manually replace the database name in the URI string without losing query params
    const qIndex = mainUri.indexOf('?');
    const query = qIndex !== -1 ? mainUri.substring(qIndex) : '';
    const uriWithoutQuery = qIndex !== -1 ? mainUri.substring(0, qIndex) : mainUri;
    
    const lastSlash = uriWithoutQuery.lastIndexOf('/');
    if (lastSlash !== -1) {
      const base = uriWithoutQuery.substring(0, lastSlash);
      return `${base}/${databaseName}${query}`;
    }
    return `${mainUri}/${databaseName}${query}`;
  }
}

async function getTenantConnection(hospitalCode) {
  const code = hospitalCode.toUpperCase();

  if (tenantConnections[code]) {
    if (tenantConnections[code].readyState === 1) {
      return tenantConnections[code];
    }
    if (tenantConnections[code].readyState === 0 || tenantConnections[code].readyState === 3) {
      delete tenantConnections[code];
    }
  }

  const databaseName = `hospital_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const databaseUri = getTenantDatabaseUri(config.MONGO_URI, databaseName);

  console.log(`Establishing connection to tenant database: ${databaseName}`);

  const conn = mongoose.createConnection(databaseUri);
  await conn.asPromise();

  // Register tenant-specific models
  const tenantModels = [
    'Branch', 'Department', 'Role', 'Permission', 'User',
    'Patient', 'Appointment', 'Consultation', 'Prescription',
    'Medicine', 'MedicineBatch', 'Invoice', 'UserSession',
    'AuditLog', 'ClinicalDiagnosis', 'MedicineForm',
    'MedicineFrequency', 'MedicineDosage', 'FoodInstruction'
  ];

  for (const modelName of tenantModels) {
    const modelModule = require(`../models/${modelName}`);
    conn.model(modelName, modelModule.schema, modelModule.collectionName);
  }

  // Register central models in the tenant connection registry to support cross-db populate queries
  const centralModels = ['Hospital'];
  for (const modelName of centralModels) {
    const centralModel = mongoose.models[modelName];
    if (centralModel) {
      conn.models[modelName] = centralModel;
    }
  }

  tenantConnections[code] = conn;
  return conn;
}

module.exports = {
  getTenantConnection,
  getTenantDatabaseUri
};
