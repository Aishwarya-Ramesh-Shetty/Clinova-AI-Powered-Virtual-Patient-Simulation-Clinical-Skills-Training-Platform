require('../src/config/env');

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../src/config/db');
const Doctor = require('../src/models/Doctor');

// FICTIONAL demo healthcare providers stored in the local MongoDB.
// These are not real doctors — the UI labels every card "Demo Provider".
// Password for every demo doctor: Demo@1234  (login = <name-slug>@demo.clinova.test)
const demoDoctors = [
	// ── The 10 requested demo providers ─────────────────────────────────────
	{
		name: 'Dr. Priya Sharma',
		specialty: 'Cardiology',
		clinicName: 'Sunrise Heart Clinic',
		hospitalName: 'Sunrise Heart Clinic',
		address: '12 Sea Breeze Road, Mumbai',
		phone: '+91 90000 00001',
		rating: 4.7,
		experience: 8,
		consultationFee: 800,
		location: { type: 'Point', coordinates: [72.8300, 19.3900] },
		availableSlots: [{ date: '2026-10-05', times: ['09:00', '10:30', '14:00'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Vivek Rao',
		specialty: 'Cardiology',
		clinicName: 'Coastal Cardiac Centre',
		hospitalName: 'Coastal Cardiac Centre',
		address: '7 Harbour View Lane, Mumbai',
		phone: '+91 90000 00002',
		rating: 4.6,
		experience: 11,
		consultationFee: 950,
		location: { type: 'Point', coordinates: [72.8350, 19.3950] },
		availableSlots: [{ date: '2026-10-06', times: ['09:30', '12:00', '16:00'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Ananya Mehta',
		specialty: 'General Physician',
		clinicName: 'Lakeview Family Clinic',
		hospitalName: 'Lakeview Family Clinic',
		address: '23 Lakeview Road, Mumbai',
		phone: '+91 90000 00003',
		rating: 4.5,
		experience: 7,
		consultationFee: 500,
		location: { type: 'Point', coordinates: [72.8450, 19.4050] },
		availableSlots: [{ date: '2026-10-05', times: ['08:30', '11:00', '15:30'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Rohan Desai',
		specialty: 'General Physician',
		clinicName: 'Riverbend Medical Centre',
		hospitalName: 'Riverbend Medical Centre',
		address: '41 Riverside Drive, Mumbai',
		phone: '+91 90000 00004',
		rating: 4.4,
		experience: 9,
		consultationFee: 550,
		location: { type: 'Point', coordinates: [72.8250, 19.3850] },
		availableSlots: [{ date: '2026-10-06', times: ['10:00', '13:00', '17:00'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Neha Kulkarni',
		specialty: 'Dermatology',
		clinicName: 'ClearSkin Derma Clinic',
		hospitalName: 'ClearSkin Derma Clinic',
		address: '9 Palm Grove Street, Mumbai',
		phone: '+91 90000 00005',
		rating: 4.6,
		experience: 6,
		consultationFee: 600,
		location: { type: 'Point', coordinates: [72.8380, 19.3980] },
		availableSlots: [{ date: '2026-10-07', times: ['09:15', '12:45', '16:15'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Arjun Patel',
		specialty: 'Orthopedics',
		clinicName: 'Apex Bone and Joint Clinic',
		hospitalName: 'Apex Bone and Joint Clinic',
		address: '55 Hillcrest Avenue, Mumbai',
		phone: '+91 90000 00006',
		rating: 4.5,
		experience: 12,
		consultationFee: 750,
		location: { type: 'Point', coordinates: [72.8150, 19.3750] },
		availableSlots: [{ date: '2026-10-05', times: ['09:45', '13:15', '16:45'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Sneha Nair',
		specialty: 'Gynecology',
		clinicName: "Blossom Women's Clinic",
		hospitalName: "Blossom Women's Clinic",
		address: '18 Rose Garden Road, Mumbai',
		phone: '+91 90000 00007',
		rating: 4.7,
		experience: 10,
		consultationFee: 700,
		location: { type: 'Point', coordinates: [72.8420, 19.4080] },
		availableSlots: [{ date: '2026-10-06', times: ['08:45', '11:30', '14:45'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Karan Shah',
		specialty: 'ENT',
		clinicName: 'Harmony ENT Clinic',
		hospitalName: 'Harmony ENT Clinic',
		address: '3 Central Plaza, Mumbai',
		phone: '+91 90000 00008',
		rating: 4.3,
		experience: 8,
		consultationFee: 550,
		location: { type: 'Point', coordinates: [72.8280, 19.3880] },
		availableSlots: [{ date: '2026-10-07', times: ['10:15', '13:45', '17:15'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Meera Joshi',
		specialty: 'Neurology',
		clinicName: 'Summit Neurology Clinic',
		hospitalName: 'Summit Neurology Clinic',
		address: '64 Summit Heights, Mumbai',
		phone: '+91 90000 00009',
		rating: 4.8,
		experience: 13,
		consultationFee: 900,
		location: { type: 'Point', coordinates: [72.8500, 19.4150] },
		availableSlots: [{ date: '2026-10-05', times: ['09:30', '12:30', '15:30'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Rahul Iyer',
		specialty: 'Pediatrics',
		clinicName: "Sunbeam Children's Clinic",
		hospitalName: "Sunbeam Children's Clinic",
		address: '27 Meadow Lane, Mumbai',
		phone: '+91 90000 00010',
		rating: 4.5,
		experience: 5,
		consultationFee: 450,
		location: { type: 'Point', coordinates: [72.8200, 19.3700] },
		availableSlots: [{ date: '2026-10-06', times: ['08:15', '10:45', '14:15'] }],
		isDemo: true,
		demoProvider: true
	},
	// ── Additional demo providers from the original seed (kept for existing data) ──
	{
		name: 'Dr. Asha Kulkarni',
		specialty: 'Neurology',
		clinicName: 'Harbor Neurology Clinic',
		hospitalName: 'Harbor Neurology Clinic',
		address: '31 Harbour Street, Mumbai',
		phone: '+91 90000 00011',
		rating: 4.8,
		experience: 10,
		consultationFee: 900,
		location: { type: 'Point', coordinates: [72.8200, 19.3800] },
		availableSlots: [{ date: '2026-10-05', times: ['10:00', '13:30', '15:00'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Nisha Menon',
		specialty: 'General Physician',
		clinicName: 'Bayview Family Health',
		hospitalName: 'Bayview Family Health',
		address: '88 Bayview Esplanade, Mumbai',
		phone: '+91 90000 00012',
		rating: 4.5,
		experience: 7,
		consultationFee: 500,
		location: { type: 'Point', coordinates: [72.8400, 19.4100] },
		availableSlots: [{ date: '2026-10-05', times: ['08:30', '11:00', '17:00'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Kabir Nair',
		specialty: 'Orthopedics',
		clinicName: 'Seaview Bone and Joint Clinic',
		hospitalName: 'Seaview Bone and Joint Clinic',
		address: '14 Cliff Road, Mumbai',
		phone: '+91 90000 00013',
		rating: 4.4,
		experience: 9,
		consultationFee: 700,
		location: { type: 'Point', coordinates: [72.8100, 19.3700] },
		availableSlots: [{ date: '2026-10-06', times: ['09:00', '13:00', '16:30'] }],
		isDemo: true,
		demoProvider: true
	},
	{
		name: 'Dr. Meera Iyer',
		specialty: 'Cardiology',
		clinicName: 'North Shore Heart Centre',
		hospitalName: 'North Shore Heart Centre',
		address: '52 North Shore Drive, Mumbai',
		phone: '+91 90000 00014',
		rating: 4.3,
		experience: 6,
		consultationFee: 650,
		location: { type: 'Point', coordinates: [72.8500, 19.4200] },
		availableSlots: [{ date: '2026-10-07', times: ['10:00', '14:00', '16:00'] }],
		isDemo: true,
		demoProvider: true
	}
];

const DEMO_DOCTOR_PASSWORD = 'Demo@1234';

function slugEmail(name) {
	let base = String(name).toLowerCase();
	if (base.startsWith('dr.')) base = base.slice(3).trim();
	let slug = '';
	let prevDot = false;
	for (const ch of base) {
		const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
		if (isAlnum) { slug += ch; prevDot = false; }
		else if (!prevDot && slug) { slug += '.'; prevDot = true; }
	}
	while (slug.endsWith('.')) slug = slug.slice(0, -1);
	return slug + '@demo.clinova.test';
}

// Rolling availability: the NEXT 7 days (starting tomorrow), reusing each doctor's
// seeded times, so demo slots are always in the future and never expire.
function rollingSlots(times, days = 7) {
	const slots = [];
	for (let i = 1; i <= days; i += 1) {
		const d = new Date();
		d.setDate(d.getDate() + i);
		const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		slots.push({ date, times });
	}
	return slots;
}

async function seedDemoDoctors() {
	await connectDB();

	const passwordHash = await bcrypt.hash(DEMO_DOCTOR_PASSWORD, 10);

	for (const doctor of demoDoctors) {
		const times = doctor.availableSlots[0].times;
		await Doctor.updateOne(
			{ name: doctor.name, clinicName: doctor.clinicName, isDemo: true },
			{
				$set: {
					...doctor,
					availableSlots: rollingSlots(times),
					email: slugEmail(doctor.name),
					password: passwordHash
				}
			},
			{ upsert: true, runValidators: true }
		);
	}

	console.log(`Seeded ${demoDoctors.length} fictional demo healthcare providers.`);
	console.log(`Demo doctor logins (password: ${DEMO_DOCTOR_PASSWORD}):`);
	demoDoctors.forEach((d) => console.log(`  ${d.name} -> ${slugEmail(d.name)}`));
}

if (require.main === module) {
	seedDemoDoctors()
		.catch((error) => {
			console.error('Doctor demo seed failed:', error.message);
			process.exitCode = 1;
		})
		.finally(async () => mongoose.disconnect());
}

module.exports = { demoDoctors, seedDemoDoctors };
