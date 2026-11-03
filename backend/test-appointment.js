const mongoose = require('./node_modules/mongoose');
require('dotenv').config({ path: './.env' });
const Appointment = require('./server/models/Appointment');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const tenantDb = mongoose.connection.useDb('hospital_rh');
    const TenantAppointment = tenantDb.model('Appointment', Appointment.schema);

    const patient = await tenantDb.collection('patients').findOne({});
    const doctor = await tenantDb.collection('users').findOne({ _id: new mongoose.Types.ObjectId('6ab752885199de161336ccb5') });

    console.log('Patient found:', patient?._id, patient?.name);
    console.log('Doctor found:', doctor?._id, doctor?.name);

    console.log('\n--- Test 1: appointmentSlot as primitive string "10:00" ---');
    try {
      const doc = new TenantAppointment({
        patientId: patient._id,
        doctorId: doctor._id,
        date: new Date('2026-10-18T12:00:00.000Z'),
        time: '10:00 AM',
        tokenNumber: '',
        consultationType: 'Appointment',
        appointmentSlot: '10:00',
        hospitalId: doctor.hospitalId,
        branchId: doctor.branchId
      });
      await doc.validate();
      console.log('Test 1 Validation passed');
    } catch (e) {
      console.log('Test 1 FAILED with:', e.message);
      if (e.errors) {
        Object.keys(e.errors).forEach(k => console.log('Field error:', k, e.errors[k].message));
      }
    }

    console.log('\n--- Test 2: appointmentSlot as object ---');
    try {
      const doc2 = new TenantAppointment({
        patientId: patient._id,
        doctorId: doctor._id,
        date: new Date('2026-10-18T12:00:00.000Z'),
        time: '10:00 AM',
        tokenNumber: '',
        consultationType: 'Appointment',
        appointmentSlot: { startTime: '10:00', endTime: '10:15', slotId: '10:00' },
        hospitalId: doctor.hospitalId,
        branchId: doctor.branchId
      });
      await doc2.validate();
      console.log('Test 2 Validation passed');
    } catch (e) {
      console.log('Test 2 FAILED with:', e.message);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
