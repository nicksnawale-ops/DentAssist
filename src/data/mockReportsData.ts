export const mockReportsData = {
  summary: {
    totalRevenue: 2845000,
    revenueChange: 14.5, // % increase
    totalAppointments: 1248,
    appointmentsChange: 8.2, // % increase
    newPatients: 142,
    newPatientsChange: -2.4, // % decrease
    avgRevenuePerPatient: 2280,
    avgRevenueChange: 5.1 // % increase
  },
  revenueTrend: [
    { date: 'Jan', revenue: 420000, target: 400000 },
    { date: 'Feb', revenue: 480000, target: 410000 },
    { date: 'Mar', revenue: 450000, target: 420000 },
    { date: 'Apr', revenue: 510000, target: 440000 },
    { date: 'May', revenue: 560000, target: 460000 },
    { date: 'Jun', revenue: 425000, target: 480000 }
  ],
  procedurePopularity: [
    { name: 'Composite Fillings', count: 428, revenue: 856000 },
    { name: 'Root Canal Treatment', count: 184, revenue: 1472000 },
    { name: 'Extraction', count: 156, revenue: 234000 },
    { name: 'Scaling & Polishing', count: 312, revenue: 624000 },
    { name: 'Dental Implants', count: 42, revenue: 1680000 },
    { name: 'Crown (Ceramic)', count: 126, revenue: 1008000 }
  ],
  clinicRevenue: [
    { clinicId: 'c-1', name: 'Downtown Main Clinic', revenue: 1250000 },
    { clinicId: 'c-2', name: 'Westside Family Dental', revenue: 980000 },
    { clinicId: 'c-3', name: 'Eastside Ortho Hub', revenue: 615000 }
  ],
  staffPerformance: [
    { id: 's-1', name: 'Dr. Sarah Smith', role: 'Chief Dentist', patientsSeen: 412, appointmentsCompleted: 485, revenueGenerated: 1420000 },
    { id: 's-2', name: 'Dr. Michael Chen', role: 'Orthodontist', patientsSeen: 284, appointmentsCompleted: 312, revenueGenerated: 980000 },
    { id: 's-3', name: 'Dr. Emily Jones', role: 'General Dentist', patientsSeen: 356, appointmentsCompleted: 390, revenueGenerated: 445000 }
  ],
  paymentMethods: [
    { name: 'Card', value: 45 },
    { name: 'UPI', value: 35 },
    { name: 'Cash', value: 15 },
    { name: 'Insurance', value: 5 }
  ]
};
