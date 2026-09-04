const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../server/config/config');

const migratePins = async () => {
  try {
    console.log('Connecting to MongoDB central database...');
    console.log(`URI: ${config.MONGO_URI}`);
    const centralConn = await mongoose.connect(config.MONGO_URI);
    console.log('Central MongoDB Connected successfully.');

    // Fetch list of all tenant databases from admin connection
    const adminDb = centralConn.connection.db.admin();
    const dbsResult = await adminDb.listDatabases();
    const allDbNames = dbsResult.databases.map(d => d.name);

    // Filter database names starting with hospital_ or villzone_
    const tenantDbNames = allDbNames.filter(name => name.startsWith('hospital_') || name.startsWith('villzone_'));
    console.log(`Discovered ${tenantDbNames.length} database(s) to scan:`, tenantDbNames);

    let totalUpdated = 0;

    const { getTenantDatabaseUri } = require('../server/utils/dbManager');
    const UserSchema = require('../server/models/User').schema;

    for (const dbName of tenantDbNames) {
      console.log(`\n--- Scanning Database: [${dbName}] ---`);
      const tenantUri = getTenantDatabaseUri(config.MONGO_URI, dbName);
      const conn = mongoose.createConnection(tenantUri);
      await conn.asPromise();

      // Check users collection
      const UserTenantModel = conn.model('User', UserSchema, 'users');
      const users = await UserTenantModel.find({});

      console.log(`Found ${users.length} user record(s) in [${dbName}].`);

      let dbUpdated = 0;
      for (const user of users) {
        if (!user.pin) continue;

        // Check if legacy PIN is '1234'
        const isLegacy4Digit = await bcrypt.compare('1234', user.pin);
        if (isLegacy4Digit) {
          user.pin = '123456'; // Will be re-hashed by pre-save hook or manually
          const salt = await bcrypt.genSalt(10);
          user.pin = await bcrypt.hash('123456', salt);
          await user.save();
          dbUpdated++;
          totalUpdated++;
          console.log(`  ✓ [MIGRATED] User: ${user.name || 'Admin'} | Mobile: ${user.mobileNumber} | Code: ${user.hospitalCode || 'N/A'} -> PIN updated to 123456.`);
        }
      }
      console.log(`Completed [${dbName}]: ${dbUpdated} PIN(s) updated.`);
      await conn.close();
    }

    console.log(`\n==============================================`);
    console.log(`SUCCESS: Multi-Tenant DB Migration Complete.`);
    console.log(`Total user records updated from 1234 to 123456 across all DBs: ${totalUpdated}`);
    console.log(`==============================================\n`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed with error:', error);
    process.exit(1);
  }
};

migratePins();
