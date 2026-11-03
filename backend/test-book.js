const mongoose = require('./node_modules/mongoose');
require('dotenv').config({ path: './.env' });
const { bookAppointment } = require('./server/controllers/operationalController');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const tenantDb = mongoose.connection.useDb('hospital_rh');

    // Find reception user
    const receptionUser = await tenantDb.collection('users').findOne({ email: /reception/i }) 
      || await tenantDb.collection('users').findOne({});
    const patient = await tenantDb.collection('patients').findOne({});
    const doctor = await tenantDb.collection('users').findOne({ _id: new mongoose.Types.ObjectId('6acdc3bf6c4f01dbcb59b81c') }); // Dr. Oviya

    console.log('User:', receptionUser?.name, receptionUser?._id, 'HospitalId:', receptionUser?.hospitalId);
    console.log('Doctor:', doctor?.name, doctor?._id);
    console.log('Patient:', patient?.name, patient?._id);

    const req = {
      body: {
        patientId: patient._id.toString(),
        doctorId: doctor._id.toString(),
        date: '2026-10-18', // Future date!
        time: '10:00 AM',
        consultationType: 'Appointment',
        chiefComplaint: 'General Consultation',
        consultationFee: 500,
        billingStatus: 'Unpaid',
        appointmentSlot: '10:00',
        bookingSource: 'RECEPTION'
      },
      user: {
        _id: receptionUser._id,
        name: receptionUser.name,
        role: receptionUser.role || 'RECEPTIONIST',
        roleId: receptionUser.roleId,
        hospitalId: receptionUser.hospitalId,
        branchId: receptionUser.branchId
      },
      hostname: 'localhost'
    };

    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        console.log('Response JSON (status:', this.statusCode || 200, '):', data);
        return this;
      }
    };

    const next = (err) => {
      console.error('Next called with error:', err);
    };

    await bookAppointment(req, res, next);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Test execution fatal error:', err);
    process.exit(1);
  }
})();
