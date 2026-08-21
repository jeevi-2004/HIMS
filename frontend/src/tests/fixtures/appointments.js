export const mockAppointments = [
  {
    _id: 'app_001',
    tokenNo: 1,
    patientId: {
      _id: 'pat_001',
      uhid: 'PAT-2026-0001',
      name: 'Rajesh Sharma',
      gender: 'Male',
      age: 42,
      mobile: '9876543210'
    },
    doctorId: {
      _id: 'doc_001',
      name: 'Dr. Anita Mehta'
    },
    visitType: 'New Visit',
    status: 'Check-In',
    queueStatus: 'Checked-In',
    createdAt: new Date().toISOString()
  }
];

export default mockAppointments;
