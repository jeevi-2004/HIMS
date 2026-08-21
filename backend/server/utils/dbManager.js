const mongoose = require('mongoose');
const config = require('../config/config');

const tenantConnections = {};

async function getTenantConnection(hospitalCode) {
  const code = hospitalCode.toUpperCase();

  if (tenantConnections[code]) {
    return tenantConnections[code];
  }

  const baseUri = config.MONGO_URI 
    ? config.MONGO_URI.substring(0, config.MONGO_URI.lastIndexOf('/'))
    : 'mongodb://localhost:27017';

  const databaseName = `hospital_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const databaseUri = `${baseUri}/${databaseName}`;

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
  getTenantConnection
};
