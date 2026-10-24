import { Patient } from '../types';

export const mockPatients: Patient[] = [
  { 
    id: 'pat_1', 
    firstName: 'Alice', 
    lastName: 'Johnson', 
    phone: '+91 98765 11111',
    email: 'alice.j@example.com',
    dob: '1985-04-12',
    gender: 'Female',
    address: '123 Park Ave, Mumbai, MH, 400001, India',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    emergencyContact: { name: 'Bob Johnson', relationship: 'Husband', phone: '+91 98765 11112' },
    medicalHistory: {
      allergies: ['Penicillin', 'Latex'],
      medications: ['Lisinopril'],
      chronicConditions: ['Hypertension'],
      pastSurgeries: 'Appendectomy (2010)'
    },
    dentalHistory: {
      reasonForVisit: 'Routine Checkup',
      lastDentalVisit: '2023-11-15',
      ongoingIssues: 'Occasional sensitivity to cold',
      smokingTobaccoUse: false
    },
    insurance: { provider: 'Star Health', policyNumber: 'SH123456', notes: 'Dental scaling covered' },
    referralSource: 'Walk-in',
    tags: ['VIP', 'Insurance'],
    lastVisit: '2024-05-10',
    nextAppointment: '2026-06-25T10:00:00Z',
    outstandingBalance: 0,
    createdAt: '2023-01-10T08:00:00Z'
  },
  { 
    id: 'pat_2', 
    firstName: 'Bob', 
    lastName: 'Smith', 
    phone: '+91 98765 22222',
    email: 'bob.s@example.com',
    dob: '1978-09-21',
    gender: 'Male',
    address: '456 Sea View, Bandra, Mumbai, MH, 400050',
    communicationPrefs: { whatsappOptIn: false, language: 'Hindi' },
    medicalHistory: {
      allergies: [],
      medications: ['Metformin'],
      chronicConditions: ['Diabetes Type 2'],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Toothache',
      lastDentalVisit: '2022-03-10',
      ongoingIssues: 'Pain in lower left molar',
      smokingTobaccoUse: true
    },
    referralSource: 'Social Media',
    tags: ['Urgent'],
    lastVisit: '2022-03-10',
    outstandingBalance: 500,
    createdAt: '2022-03-10T09:00:00Z'
  },
  { 
    id: 'pat_3', 
    firstName: 'Charlie', 
    lastName: 'Davis', 
    phone: '+91 98765 33333',
    email: 'charlie.d@example.com',
    dob: '2010-12-05',
    gender: 'Male',
    address: '789 Hill Road, Pune, MH, 411001',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    emergencyContact: { name: 'Sarah Davis', relationship: 'Mother', phone: '+91 98765 33334' },
    medicalHistory: {
      allergies: ['Peanuts'],
      medications: [],
      chronicConditions: ['Asthma'],
      pastSurgeries: 'Tonsillectomy'
    },
    dentalHistory: {
      reasonForVisit: 'Braces adjustment',
      lastDentalVisit: '2024-01-20',
      ongoingIssues: 'Orthodontic treatment',
      smokingTobaccoUse: false
    },
    referralSource: 'Referral',
    tags: ['Pediatric', 'Ortho'],
    lastVisit: '2024-01-20',
    nextAppointment: '2026-06-26T14:30:00Z',
    outstandingBalance: 0,
    createdAt: '2023-08-01T10:00:00Z'
  },
  { 
    id: 'pat_4', 
    firstName: 'Diana', 
    lastName: 'Evans', 
    phone: '+91 98765 44444',
    email: 'diana.e@example.com',
    dob: '1992-07-30',
    gender: 'Female',
    address: '101 Ocean Drive, Goa, 403001',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    medicalHistory: {
      allergies: [],
      medications: ['Prenatal vitamins'],
      chronicConditions: ['Pregnancy'],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Bleeding gums',
      lastDentalVisit: '2023-09-05',
      ongoingIssues: 'Pregnancy gingivitis',
      smokingTobaccoUse: false
    },
    referralSource: 'Google',
    tags: ['New Mother'],
    lastVisit: '2023-09-05',
    outstandingBalance: 0,
    createdAt: '2023-09-01T11:00:00Z'
  },
  { 
    id: 'pat_5', 
    firstName: 'Evan', 
    lastName: 'Wright', 
    phone: '+91 98765 55555',
    email: 'evan.w@example.com',
    dob: '1965-02-18',
    gender: 'Male',
    address: '222 Forest Ave, Bangalore, KA, 560001',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    medicalHistory: {
      allergies: ['Codeine'],
      medications: ['Warfarin', 'Atorvastatin'],
      chronicConditions: ['Heart Condition', 'Blood Thinners'],
      pastSurgeries: 'Coronary bypass (2018)'
    },
    dentalHistory: {
      reasonForVisit: 'Extraction evaluation',
      lastDentalVisit: '2021-11-20',
      ongoingIssues: 'Broken tooth',
      smokingTobaccoUse: false
    },
    referralSource: 'Walk-in',
    tags: ['High Risk', 'Senior'],
    lastVisit: '2021-11-20',
    outstandingBalance: 1200,
    createdAt: '2021-11-15T10:30:00Z'
  },
  { 
    id: 'pat_6', 
    firstName: 'Fiona', 
    lastName: 'Gallagher', 
    phone: '+91 98765 66666',
    email: 'fiona.g@example.com',
    dob: '1989-11-11',
    gender: 'Female',
    address: '55 Lake View, Udaipur, RJ, 313001',
    communicationPrefs: { whatsappOptIn: true, language: 'Hindi' },
    medicalHistory: {
      allergies: [],
      medications: [],
      chronicConditions: [],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Teeth Whitening',
      lastDentalVisit: '2024-04-10',
      ongoingIssues: 'None',
      smokingTobaccoUse: false
    },
    referralSource: 'Social Media',
    tags: ['Cosmetic'],
    lastVisit: '2024-04-10',
    outstandingBalance: 0,
    createdAt: '2024-04-01T12:00:00Z'
  },
  { 
    id: 'pat_7', 
    firstName: 'George', 
    lastName: 'Harris', 
    phone: '+91 98765 77777',
    dob: '1955-08-25',
    gender: 'Male',
    communicationPrefs: { whatsappOptIn: false, language: 'Marathi' },
    medicalHistory: {
      allergies: ['Ibuprofen'],
      medications: ['Amlodipine'],
      chronicConditions: ['Hypertension', 'Arthritis'],
      pastSurgeries: 'Knee replacement (2020)'
    },
    dentalHistory: {
      reasonForVisit: 'Denture fitting',
      lastDentalVisit: '2024-02-14',
      ongoingIssues: 'Missing teeth',
      smokingTobaccoUse: true
    },
    referralSource: 'Referral',
    tags: ['Prosthetics', 'Senior'],
    lastVisit: '2024-02-14',
    outstandingBalance: 5000,
    createdAt: '2024-01-10T09:15:00Z'
  },
  { 
    id: 'pat_8', 
    firstName: 'Hannah', 
    lastName: 'Irvine', 
    phone: '+91 98765 88888',
    email: 'hannah.i@example.com',
    dob: '1995-03-14',
    gender: 'Female',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    medicalHistory: {
      allergies: [],
      medications: ['Levothyroxine'],
      chronicConditions: ['Hypothyroidism'],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Cleaning',
      lastDentalVisit: '2023-08-22',
      ongoingIssues: 'None',
      smokingTobaccoUse: false
    },
    referralSource: 'Google',
    tags: [],
    lastVisit: '2023-08-22',
    outstandingBalance: 0,
    createdAt: '2023-08-10T14:00:00Z'
  },
  { 
    id: 'pat_9', 
    firstName: 'Ian', 
    lastName: 'Jenkins', 
    phone: '+91 98765 99999',
    email: 'ian.j@example.com',
    dob: '2005-06-30',
    gender: 'Male',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    medicalHistory: {
      allergies: ['Sulfa Drugs'],
      medications: [],
      chronicConditions: [],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Wisdom teeth evaluation',
      lastDentalVisit: '2024-05-05',
      ongoingIssues: 'Pain in back of jaw',
      smokingTobaccoUse: false
    },
    referralSource: 'Walk-in',
    tags: ['Surgery Consult'],
    lastVisit: '2024-05-05',
    outstandingBalance: 0,
    createdAt: '2024-05-01T15:30:00Z'
  },
  { 
    id: 'pat_10', 
    firstName: 'Julia', 
    lastName: 'Knox', 
    phone: '+91 98765 10101',
    email: 'julia.k@example.com',
    dob: '1982-01-19',
    gender: 'Female',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    medicalHistory: {
      allergies: [],
      medications: [],
      chronicConditions: [],
      pastSurgeries: 'C-Section (2015)'
    },
    dentalHistory: {
      reasonForVisit: 'Cavity filling',
      lastDentalVisit: '2024-03-12',
      ongoingIssues: 'None',
      smokingTobaccoUse: false
    },
    insurance: { provider: 'HDFC Ergo', policyNumber: 'HE987654', notes: 'Full coverage' },
    referralSource: 'Insurance Directory',
    tags: ['Insurance'],
    lastVisit: '2024-03-12',
    outstandingBalance: 0,
    createdAt: '2024-03-01T10:00:00Z'
  },
  { 
    id: 'pat_11', 
    firstName: 'Kevin', 
    lastName: 'Lewis', 
    phone: '+91 98765 20202',
    dob: '1970-10-08',
    gender: 'Male',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    medicalHistory: {
      allergies: ['Amoxicillin'],
      medications: ['Omeprazole'],
      chronicConditions: ['Acid Reflux'],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Crown placement',
      lastDentalVisit: '2024-04-20',
      ongoingIssues: 'Enamel erosion',
      smokingTobaccoUse: true
    },
    referralSource: 'Referral',
    tags: ['VIP'],
    lastVisit: '2024-04-20',
    outstandingBalance: 1500,
    createdAt: '2022-01-15T09:00:00Z'
  },
  { 
    id: 'pat_12', 
    firstName: 'Laura', 
    lastName: 'Martinez', 
    phone: '+91 98765 30303',
    email: 'laura.m@example.com',
    dob: '1998-05-15',
    gender: 'Female',
    communicationPrefs: { whatsappOptIn: true, language: 'English' },
    medicalHistory: {
      allergies: [],
      medications: ['Oral Contraceptives'],
      chronicConditions: [],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Routine Checkup',
      lastDentalVisit: '2023-12-01',
      ongoingIssues: 'None',
      smokingTobaccoUse: false
    },
    referralSource: 'Social Media',
    tags: [],
    lastVisit: '2023-12-01',
    outstandingBalance: 0,
    createdAt: '2023-12-01T11:00:00Z'
  },
  { 
    id: 'pat_13', 
    firstName: 'Mike', 
    lastName: 'Nelson', 
    phone: '+91 98765 40404',
    dob: '1960-12-12',
    gender: 'Male',
    communicationPrefs: { whatsappOptIn: false, language: 'English' },
    medicalHistory: {
      allergies: [],
      medications: ['Insulin', 'Lisinopril'],
      chronicConditions: ['Diabetes Type 1', 'Hypertension'],
      pastSurgeries: 'Gallbladder removal (2005)'
    },
    dentalHistory: {
      reasonForVisit: 'Gum disease treatment',
      lastDentalVisit: '2024-01-10',
      ongoingIssues: 'Periodontitis',
      smokingTobaccoUse: false
    },
    referralSource: 'Google',
    tags: ['High Risk'],
    lastVisit: '2024-01-10',
    outstandingBalance: 2500,
    createdAt: '2023-06-15T10:00:00Z'
  },
  { 
    id: 'pat_14', 
    firstName: 'Nina', 
    lastName: 'Patel', 
    phone: '+91 98765 50505',
    email: 'nina.p@example.com',
    dob: '1987-03-25',
    gender: 'Female',
    communicationPrefs: { whatsappOptIn: true, language: 'Hindi' },
    medicalHistory: {
      allergies: ['Erythromycin'],
      medications: [],
      chronicConditions: [],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Root canal consult',
      lastDentalVisit: '2024-05-15',
      ongoingIssues: 'Severe tooth pain',
      smokingTobaccoUse: false
    },
    referralSource: 'Walk-in',
    tags: ['Urgent'],
    lastVisit: '2024-05-15',
    outstandingBalance: 0,
    createdAt: '2024-05-15T09:30:00Z'
  },
  { 
    // Duplicate phone scenario for testing
    id: 'pat_15', 
    firstName: 'Omar', 
    lastName: 'Patel', 
    phone: '+91 98765 50505', // Same phone as Nina Patel
    email: 'omar.p@example.com',
    dob: '1985-08-10',
    gender: 'Male',
    communicationPrefs: { whatsappOptIn: true, language: 'Hindi' },
    medicalHistory: {
      allergies: [],
      medications: [],
      chronicConditions: [],
      pastSurgeries: 'None'
    },
    dentalHistory: {
      reasonForVisit: 'Checkup',
      lastDentalVisit: '2024-05-15',
      ongoingIssues: 'None',
      smokingTobaccoUse: false
    },
    referralSource: 'Referral',
    tags: ['Family'],
    lastVisit: '2024-05-15',
    outstandingBalance: 0,
    createdAt: '2024-05-15T09:45:00Z'
  }
];
